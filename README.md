# AWS EMEA Principal Architect Hiring Assignment

This repository is a proof-of-concept implementation of the proposed solution (short term) design for the assignment.

![Short term architecture](ShortTerm.png "Short term architecture")

It includes the new Application Load Balancer with autoscaling group and scaling policy.

It also implements the static file serving separatation through CloudFront and an S3 bucket, including cross-region deployment of digital certificates for CloudFront.

The CDK pipeline implements cross-account deployment with automated roles creation and assume.

## Instructions

The current setup is based on four accounts: **cicd**, **dev**, **test** and **prod**.

These accounts should be configured as AWS CLI profiles.

Make sure you have installed AWS CLI and CDK toolkit.

Configure **cdk.json** by replacing the entry *account* in the sections  *cicd*, *dev*, *test* and *prod* with the respective account IDs and the entry *profile* with the AWS CLI named profiles.
Complete the configuration by editing the fields *primaryRegion* and *secondaryRegion* with your selected primary and secondary deployment regions.

## Bootstrapping

To deploy the solution, first you need to make sure all the target environments are properly bootstrapped for use with AWS CDK.

The full documentation is available here --> https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html

Let's assume your AWS CLI environment is configured with four named profiles: *cicd*, *dev*, *test* and *prod*.

Assuming you properly configured the **cdk.json** file as explained in the previous section, you only need to execute the command:

`<path to workspace>/scripts/bootstrap.sh`

which will take care of bootstrapping all the environments and deploy the CDK pipeline for the solution.

## Deploy the solution

Once all the environments are bootstrapped and the pipeline activated, you need to deploy the infrastructure code by upload the code to the S3 bucket that is monitored by the CDK pipeline.
This can easily be done by executing the script:

`<path to workspace>/scripts/deploy.sh`

## Test the solution

Just execute the script `<path to workspace>/scripts/urls.sh` to compute the static (S3 served) and dynamic (ALB served) URL.
Navigate to the respective URLs to validate.

## Technical aspects

For cross-region cross-account deployments, the typical CDK pipeline needs to be adapted to work around specific behavior of resources.
For example, to properly configure a CloudFront distribution with origin groups and origins, the stack needs to have access to resources in both regions.
Therefore, you first need to:

* have stages to deploy them in the selected regions
* put in place a mechanism to share relevant data across regions
* a surrounding stage that creates the Distribution after the dependencies are all set up

This is implemented in the `pipeline.ts` file creating:

* a primary stage to deploy in the primary region and create parameters to share data (i.e. ALB DNS name)
* a secondary stage to deploy in the DR region and create parameters to share data (i.e. ALB DNS name)
* a third stage to read the parameters values, use them to look up the relevant resources and then configure the CloudFront distribution

For the last step, I created a class to dynamically read SSM Parameters in cross-region fashion (`lib/reader.ts`), using an AWS Custom Resource construct.

The complexity of the pipeline comes also by the fact that certain global resources requires the primary to be already created, others the secondary.

This is conflicting case of the Aurora Global database and the Redis Global Datastore.
In cases like this, the best way to proceed is to perform a dependency analysis, highlight the hard dependencies across stages, isolate them into individual stacks and sequence the stages deployment according to the linearized dependency graph.

This is the reason why the pipeline seems to have multiple stages across the primary and secondary region, going back and forth.
