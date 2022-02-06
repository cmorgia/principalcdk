import { CfnOutput, Stack, StackProps, Stage, StageProps } from "aws-cdk-lib";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { AddStageOpts, CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep } from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { AppStack } from "./cdk-stack";
import { Config, EnvConfig, ReplicaConfig } from "./config";
import { ReplicaStack } from "./replica-stack";

export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps, envConfigs: { [env: string]: EnvConfig }) {
        super(scope, id, props);

        const packageObjectName = 'package.zip';

        const sourceBucket = new Bucket(this, 'sourceBucket', {
            versioned: true, // a Bucket used as a source in CodePipeline must be versioned
            bucketName: `code-artifacts-${props.env?.region}-${props.env?.account}`
        });
        const pipeline = new CodePipeline(this,'mainPipeline',{
            crossAccountKeys: true,
            synth: new ShellStep('Synth',{
                input: CodePipelineSource.s3(sourceBucket,packageObjectName),
                installCommands: [ 'npm i -g npm'],
                commands: [
                    'npm ci', 
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
                secondaryRegion: envConfig.primaryRegion
            };
            pipeline.addStage(new ApplicationStage(this,`${envName}Secondary`,secondaryConfig, { 
                env: { account: envConfig.account, region: envConfig.secondaryRegion }
            }));
    
            const primaryConfig:Config = {
                primary: true,
                cidr: envConfig.primaryCidr,
                primaryRegion: envConfig.primaryRegion,
                secondaryRegion: envConfig.secondaryRegion
            };
            pipeline.addStage(new ApplicationStage(this,`${envName}Primary`,primaryConfig, { 
                env: { account: envConfig.account, region: envConfig.primaryRegion }
            }));
    
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
        
        new CfnOutput(this,'packageTarget',{
            description: 'S3 URL pipeline source object',
            value: sourceBucket.s3UrlForObject(packageObjectName)
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