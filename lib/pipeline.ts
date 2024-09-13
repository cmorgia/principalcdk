import { CfnOutput, Stack, StackProps, Stage, StageProps } from "aws-cdk-lib";
import { AddStageOpts, CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { AppStack, RedisSecondaryStack } from "./cdk-stack";
import { Config, EnvConfig, ReplicaConfig } from "./config";
import { ReplicaStack } from "./replica-stack";

export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps, envConfigs: { [env: string]: EnvConfig }) {
        super(scope, id, props);

        const pipeline = new CodePipeline(this,'mainPipeline',{
            crossAccountKeys: true,
            synth: new ShellStep('Synth',{
                input: CodePipelineSource.connection('cmorgia/principalcdk','main',{
                    connectionArn: `arn:aws:codeconnections:${Stack.of(this).region}:${Stack.of(this).account}:connection/a595bf83-75f7-4404-8d11-fea6b9d53e2d`
                }),
                installCommands: [ 'npm i -g npm', 'npm update' ],
                commands: [
                    'npm ci',
                    './scripts/fix.sh',
                    'npx cdk synth'
                ]
            })
        });

        const lastConfigIndex = Object.keys(envConfigs).length-1;
        Object.entries(envConfigs).forEach( (entry,index) => {
            const envName = entry[0];
            const envConfig = entry[1];
            const isLast = index==lastConfigIndex;

            const secondaryConfig:Config = {
                primary: false,
                cidr: envConfig.secondaryCidr,
                primaryRegion: envConfig.secondaryRegion,
                secondaryRegion: envConfig.primaryRegion,
                enableRedis: envConfig.enableRedis,
                enableAurora: envConfig.enableAurora
            };
            pipeline.addStage(new ApplicationStage(this,`${envName}Secondary`,secondaryConfig, { 
                env: { account: envConfig.account, region: envConfig.secondaryRegion }
            }));
    
            const primaryConfig:Config = {
                primary: true,
                cidr: envConfig.primaryCidr,
                primaryRegion: envConfig.primaryRegion,
                secondaryRegion: envConfig.secondaryRegion,
                enableRedis: envConfig.enableRedis,
                enableAurora: envConfig.enableAurora
            };
            pipeline.addStage(new ApplicationStage(this,`${envName}Primary`,primaryConfig, { 
                env: { account: envConfig.account, region: envConfig.primaryRegion }
            }));
    
            if (envConfig.enableRedis) {
                pipeline.addStage(new RedisSecondaryStage(this,`${envName}RedisSecondary`, envConfig.primaryRegion, { 
                    env: { account: envConfig.account, region: envConfig.secondaryRegion }
                }));
            }

            const replicaConfig:ReplicaConfig = {
                primaryRegion: secondaryConfig.primaryRegion,
                secondaryRegion: secondaryConfig.secondaryRegion
            };

            const stageOpts:AddStageOpts = {
                post: isLast ? [] : [ new ManualApprovalStep(`${envName}ManualApprovalStep`) ]
            };

            pipeline.addStage(new ReplicationStage(this,`${envName}Replica`,replicaConfig, { 
                env: { account: envConfig.account, region: envConfig.primaryRegion }
            }),stageOpts);
        });
    }
}

class ApplicationStage extends Stage {
    constructor(scope: Construct, id: string, config: Config, props?: StageProps) {
        super(scope, id, props);
    
        const primary = new AppStack(this, `${id}Stack`, {
            env: { account: props?.env?.account, region: props?.env?.region }
        },config);
      }
}

class ReplicationStage extends Stage {
    constructor(scope: Construct, id: string, config: ReplicaConfig, props?: StageProps) {
        super(scope, id, props);
    
        const primary = new ReplicaStack(this, 'ReplicaStack', {
            env: { account: props?.env?.account, region: props?.env?.region }
        },config);
      }
}

class RedisSecondaryStage extends Stage {
    constructor(scope: Construct, id: string, primaryRegion: string, props?: StageProps) {
        super(scope, id, props);
    
        const redisSecondary = new RedisSecondaryStack(this, 'RedisSecondaryStack', {
            env: { account: props?.env?.account, region: props?.env?.region }
        },primaryRegion);
      }
}