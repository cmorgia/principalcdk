import { Bucket, BucketProps, CfnBucket, CfnBucketProps } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class ReplicatedBucket extends Bucket {
    constructor(
        scope: Construct,
        id: string,
        props: BucketProps & Required<Pick<CfnBucketProps, 'replicationConfiguration'>>
    ) {
        const { replicationConfiguration, ...bucketProps } = props;
        super(scope, id, bucketProps);
        (this.node.defaultChild as CfnBucket).replicationConfiguration = replicationConfiguration;
    }
}