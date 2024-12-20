import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Stack, Tags } from 'aws-cdk-lib';
import { Distribution, OriginAccessIdentity, OriginProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, OriginGroup, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ReplicaConfig } from './config';
import { SSMParameterReader } from 'xregion-ssm-parameter-reader';

export class ReplicaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, config:ReplicaConfig) {
    super(scope, id, props);
    
    const primaryLBDNS = new SSMParameterReader(this,'primaryLBDNS',{parameterName: `lb-${config.primaryRegion}`, region: config.primaryRegion}).retrieveParameterValue();
    const secondaryLBDNS = new SSMParameterReader(this,'secondaryLBDNS',{parameterName: `lb-${config.secondaryRegion}`, region: config.secondaryRegion}).retrieveParameterValue();

    const primaryOAIName = new SSMParameterReader(this,'primaryOAIName',{parameterName: `oai-${config.primaryRegion}`, region: config.primaryRegion}).retrieveParameterValue();
    const secondaryOAIName = new SSMParameterReader(this,'secondaryOAIName',{parameterName: `oai-${config.secondaryRegion}`, region: config.secondaryRegion}).retrieveParameterValue();

    const primarySecretHeader = new SSMParameterReader(this,'primarySecretHeader',{parameterName: `header-${config.primaryRegion}`, region: config.primaryRegion}).retrieveParameterValue();
    const secondarySecretHeader = new SSMParameterReader(this,'secondarySecretHeader',{parameterName: `header-${config.secondaryRegion}`, region: config.secondaryRegion}).retrieveParameterValue();

    const primaryBucket = Bucket.fromBucketAttributes(this, 'primaryBucket', { bucketName: `static-files-${Stack.of(this).account}-${config.primaryRegion}`, region: config.primaryRegion });
    const secondaryBucket = Bucket.fromBucketAttributes(this, 'secondaryBucket', { bucketName: `static-files-${Stack.of(this).account}-${config.secondaryRegion}`, region: config.secondaryRegion });

    const primaryOAI = OriginAccessIdentity.fromOriginAccessIdentityId(this,'primaryOAI',primaryOAIName);
    const secondaryOAI = OriginAccessIdentity.fromOriginAccessIdentityId(this,'secondaryOAI',secondaryOAIName);

    const distrib = new Distribution(this, 'distrib', {
      defaultBehavior: { 
        origin: new OriginGroup({
          primaryOrigin: new HttpOrigin(primaryLBDNS, { 
            protocolPolicy: OriginProtocolPolicy.HTTP_ONLY, 
            customHeaders: { "Secret-Custom-Header": primarySecretHeader }
          }),
          fallbackOrigin: new HttpOrigin(secondaryLBDNS, { 
            protocolPolicy: OriginProtocolPolicy.HTTP_ONLY, 
            customHeaders: { "Secret-Custom-Header": secondarySecretHeader }
          }),
        })
      },
      additionalBehaviors: {
        'static/*': { 
          origin: new OriginGroup({
            primaryOrigin: S3BucketOrigin.withOriginAccessIdentity(primaryBucket, { originAccessIdentity: primaryOAI }),
            fallbackOrigin: S3BucketOrigin.withOriginAccessIdentity(secondaryBucket, { originAccessIdentity: secondaryOAI })
          })
        }
      }
    });

    Tags.of(distrib).add('DistributionName','TestDistribution');

    new CfnOutput(this,'staticUrl',{
      value: `https://${distrib.distributionDomainName}/static/demo.html`
    });

    new CfnOutput(this,'dynamicUrl',{
      value: `https://${distrib.distributionDomainName}/demo.html`
    });
  }

}
