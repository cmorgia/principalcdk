import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AutoScalingGroup, Signals } from 'aws-cdk-lib/aws-autoscaling';
import { OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront';
import { AmazonLinuxImage, CloudFormationInit, InitCommand, InitConfig, InitFile, InitGroup, InitPackage, InitService, InstanceClass, InstanceSize, InstanceType, Peer, Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { CfnGlobalReplicationGroup, CfnReplicationGroup, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { ApplicationListenerRule, ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, ListenerAction, ListenerCondition, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { AuroraPostgresEngineVersion, DatabaseClusterEngine, ParameterGroup } from 'aws-cdk-lib/aws-rds';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { GolbalAuroraRDSMaster as GlobalAuroraMaster, GolbalAuroraRDSSlaveInfra as GlobalAuroraSlave } from 'cdk-aurora-globaldatabase';
import { Construct } from 'constructs';
import { Config } from './config';
import { SSMParameterReader } from './reader';
import { ReplicatedBucket } from './replicated';
export class AppStack extends Stack {
  public bucket: Bucket;
  public alb: ApplicationLoadBalancer;
  private redisGlobalPrefix:{[key:string]:string}={
    "us-east-2":"fpkhr",
    "us-east-1":"ldgnf",
    "us-west-1":"virxk",
    "us-west-2":"sgaui",
    "ca-central-1":"bxodz",
    "ap-south-1":"erpgt",
    "ap-northeast-1":"quwsw",
    "ap-northeast-2":"lfqnh",
    "ap-northeast-3":"nlapn",
    "ap-southeast-1":"vlqxn",
    "ap-southeast-2":"vbgxd",
    "eu-central-1":"iudkw",
    "eu-west-1":"gxeiz",
    "eu-west-2":"okuqm",
    "eu-west-3":"fgjhi",
    "sa-east-1":"juxlw",
    "cn-north-1":"emvgo",
    "cn-northwest-1":"ckbem",
    "ap-east-1":"knjmp",
    "us-gov-west-1":"sgwui",
  };

  protected fixedLengthRandom(len: number): string {
    const rand = Math.floor(Math.random() * (Math.pow(10, len) + 1));
    return rand.toString().padStart(len, "0");
  }

  constructor(scope: Construct, id: string, props: StackProps, config: Config) {
    super(scope, id, props);

    // default AZs = 3, public+private subnet per AZ
    const vpc = new Vpc(this, 'vpc', {
      cidr: config.cidr,
    });

    const alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc: vpc,
      internetFacing: true
    });

    const tg = new ApplicationTargetGroup(this, 'tg', {
      protocol: ApplicationProtocol.HTTP,
      vpc: vpc,
      targetType: TargetType.INSTANCE,
      healthCheck: {
        enabled: true,
        path: '/demo.html'
      }
    });

    // this is the random value of the secret header that CloudFront will inject on the request to the origin, the ALB.
    // since the ALB and its rule are created before the CloudFront distribution, the secret value is created here and stored
    // in an SSM Parameter object, to be later fetched by the ReplicaStack to configure the distribution
    const headerValue = `${this.fixedLengthRandom(8)}-${this.fixedLengthRandom(4)}-${this.fixedLengthRandom(6)}-${this.fixedLengthRandom(3)}`;

    // the listener responds by default with a 403, unless the secret header is found and the request is forwarded to the target group
    const listener = alb.addListener('albListener', { protocol: ApplicationProtocol.HTTP, defaultAction: ListenerAction.fixedResponse(403) });
    new ApplicationListenerRule(this, 'defaultForward', {
      listener: listener,
      priority: 1,
      targetGroups: [tg],
      conditions: [ListenerCondition.httpHeader("Secret-Custom-Header", [headerValue])]
    });

    // the autoscaling group is configured to refresh the instances every 3 hours, as a security measure to limit potential attackers
    const asg = new AutoScalingGroup(this, 'asg', {
      vpc: vpc,
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MICRO),
      machineImage: new AmazonLinuxImage(),
      maxCapacity: 5,
      maxInstanceLifetime: Duration.days(7),
      init: CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['yumPreinstall', 'config'],
        },
        configs: {
          yumPreinstall: new InitConfig([
            InitPackage.yum('httpd'),
          ]),
          config: new InitConfig([
            InitFile.fromAsset('/var/www/html/demo.html', 'lib/albFiles/demo.html'),
            InitFile.fromAsset('/tmp/perms.sh', 'lib/perms.sh', { mode: '000777' }),
            InitGroup.fromName('www'),
            InitService.enable('httpd'),
            InitCommand.shellCommand('sh -c /tmp/perms.sh')
          ]),
        },
      }),
      signals: Signals.waitForAll({
        timeout: Duration.minutes(10),
      })
    });

    asg.attachToApplicationTargetGroup(tg);

    asg.connections.allowFrom(alb, Port.tcp(80));
    asg.scaleOnCpuUtilization('cpuScale', { targetUtilizationPercent: 50 });

    const replicaRole = new Role(this, 'replicationRole', {
      assumedBy: new ServicePrincipal('s3.amazonaws.com')
    });

    var bucket;
    var oai;

    if (config.primary) {
      bucket = new ReplicatedBucket(this, 'staticFiles', {
        bucketName: `static-files-${Stack.of(this).account}-${config.primaryRegion}`,
        removalPolicy: RemovalPolicy.DESTROY,
        versioned: true,
        replicationConfiguration: {
          role: replicaRole.roleArn,
          rules: [{
            status: 'Disabled',
            destination: {
              bucket: `arn:aws:s3:::static-files-${Stack.of(this).account}-${config.secondaryRegion}`
            }
          }]
        }
      });

      oai = new OriginAccessIdentity(this, 'primaryOAI', { comment: "OAI for primary bucket" });

    } else {
      bucket = new Bucket(this, 'staticFiles', {
        versioned: true,
        removalPolicy: RemovalPolicy.DESTROY,
        bucketName: `static-files-${Stack.of(this).account}-${config.primaryRegion}`
      });

      oai = new OriginAccessIdentity(this, 'secondaryOAI', { comment: "OAI for secondary bucket" });
    }

    new BucketDeployment(this, 'bucketFiles', {
      destinationBucket: bucket,
      sources: [Source.asset('./lib/s3Files')],
      destinationKeyPrefix: 'static',
    });

    bucket.grantRead(oai);

    //this.setupRedis(vpc, config.primary, config.secondaryRegion);
    this.setupAurora(vpc, config.primary, config.secondaryRegion);

    new StringParameter(this, `lb-${Stack.of(this).region}`, {
      parameterName: `lb-${Stack.of(this).region}`,
      stringValue: alb.loadBalancerDnsName,
    });

    new StringParameter(this, `oai-${Stack.of(this).region}`, {
      parameterName: `oai-${Stack.of(this).region}`,
      stringValue: oai.originAccessIdentityName,
    });

    new StringParameter(this, `header-${Stack.of(this).region}`, {
      parameterName: `header-${Stack.of(this).region}`,
      stringValue: headerValue,
    });

    this.alb = alb;
    this.bucket = bucket;
  }

  private setupRedis(vpc: Vpc, isPrimary: boolean, secondaryRegion: string) {
    const secGroup = new SecurityGroup(this, 'redisSecGroup', { vpc: vpc });
    secGroup.connections.allowFrom(Peer.ipv4(vpc.vpcCidrBlock), Port.tcp(6379));

    const subnetGroup = new CfnSubnetGroup(this, 'redisSubnetGroup', {
      cacheSubnetGroupName: `redisSubnetGroup-${Stack.of(this).account}`,
      subnetIds: vpc.selectSubnets({ subnetGroupName: 'Private' }).subnetIds,
      description: 'SubnetGroup for Redis Cluster'
    });

    const redisReplGroup = new CfnReplicationGroup(this, 'redis', {
      replicationGroupId: `redis-${Stack.of(this).account}-${Stack.of(this).region}`,
      replicationGroupDescription: 'Redis Replication Group',
      cacheNodeType: 'cache.m5.large',
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
      multiAzEnabled: true,
      numCacheClusters: 2,
      automaticFailoverEnabled: true,
      engine: 'redis',
      port: 6379,
      securityGroupIds: [secGroup.securityGroupId],
      snapshotRetentionLimit: 7,
      globalReplicationGroupId: `${this.redisGlobalPrefix[Stack.of(this).region]}-globalredis`
    });
    redisReplGroup._addResourceDependency(subnetGroup);


    if (isPrimary) {
      const globalReplicationGroup = new CfnGlobalReplicationGroup(this, 'globalRedis', {
        globalReplicationGroupIdSuffix: 'globalredis',
        members: [
          { replicationGroupId: redisReplGroup.replicationGroupId, replicationGroupRegion: Stack.of(this).region, role: 'PRIMARY' }
        ],
        regionalConfigurations: [{ replicationGroupId: 'secondary', replicationGroupRegion: secondaryRegion }]
      });
      globalReplicationGroup.addDependsOn(redisReplGroup);
    }
  }

  private setupAurora(vpc: Vpc, isPrimary: boolean, secondaryRegion: string) {
    if (isPrimary) {
      const dbSubnetName = new SSMParameterReader(this,'dbSubnetName',{
        parameterName: `aurora-secondary-subnet-${secondaryRegion}`, 
        region: secondaryRegion
      }).getParameterValue();

      const v17 = DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_11_7
      });

      const primary = new GlobalAuroraMaster(this, 'primaryAurora', {
        vpc: vpc,
        engineVersion: v17,
        rdsPassword: '1qidhqwwu3',
        dbClusterpPG: new ParameterGroup(this, 'dbClusterparametergroup', {
          engine: v17,
          parameters: {
            'rds.force_ssl': '1',
            'rds.log_retention_period': '10080',
            'auto_explain.log_min_duration': '5000',
            'auto_explain.log_verbose': '1',
            'timezone': 'UTC+8',
            'shared_preload_libraries': 'auto_explain,pg_stat_statements,pg_hint_plan,pgaudit',
            'log_connections': '1',
            'log_statement': 'ddl',
            'log_disconnections': '1',
            'log_lock_waits': '1',
            'log_min_duration_statement': '5000',
            'log_rotation_age': '1440',
            'log_rotation_size': '102400',
            'random_page_cost': '1',
            'track_activity_query_size': '16384',
            'idle_in_transaction_session_timeout': '7200000',
          },
        }),
        
      });

      primary.addRegionalCluster(this,'auroraRegional',{
        region: secondaryRegion,
        dbSubnetGroupName: dbSubnetName
      });
    } else {
      const secondary = new GlobalAuroraSlave(this, 'secondaryAurora', { vpc: vpc });
      new StringParameter(this, `aurora-secondary-subnet-${Stack.of(this).region}`, {
        parameterName: `aurora-secondary-subnet-${Stack.of(this).region}`,
        stringValue: secondary.dbSubnetGroup.dbSubnetGroupName || "",
      });
    }
  }
}
