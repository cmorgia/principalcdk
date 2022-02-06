#!/bin/sh

export PARENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && cd .. && pwd )"
cd $PARENT_DIR

export CICD_ID=$(jq -r .context.cicd.account cdk.json)
# change below with your profile name
export AWS_PROFILE=$(jq -r .context.cicd.profile <cdk.json)
export AWS_DEFAULT_REGION=$(jq -r .context.common.primaryRegion cdk.json)

export S3OBJURL=$(aws cloudformation describe-stacks --stack-name PipelineStack --query "Stacks[0].Outputs[?OutputKey=='packageTarget'].OutputValue" --output text)
rm -f /tmp/package.zip && zip -x "node_modules/*" -x "cdk.out/*" -x ".git/*" -x ".history/*" -r /tmp/package.zip . && aws s3 cp /tmp/package.zip $S3OBJURL && rm -f /tmp/package.zip