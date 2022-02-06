#!/bin/sh

export PARENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && cd .. && pwd )"
cd $PARENT_DIR

export CICD_ACCOUNT_ID=$(jq -r .context.cicd.account <cdk.json)
export DEV_ACCOUNT_ID=$(jq -r .context.dev.account <cdk.json)
export TEST_ACCOUNT_ID=$(jq -r .context.test.account <cdk.json)
export PROD_ACCOUNT_ID=$(jq -r .context.prod.account <cdk.json)

export CICD_PROFILE=$(jq -r .context.cicd.profile <cdk.json)
export DEV_PROFILE=$(jq -r .context.dev.profile <cdk.json)
export TEST_PROFILE=$(jq -r .context.test.profile <cdk.json)
export PROD_PROFILE=$(jq -r .context.prod.profile <cdk.json)

export PRIMARY_REGION=$(jq -r .context.common.primaryRegion <cdk.json)
export SECONDARY_REGION=$(jq -r .context.common.secondaryRegion <cdk.json)

# bootstrap for CDK pipeline only, main region
cdk bootstrap --profile $CICD_PROFILE --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess aws://$CICD_ACCOUNT_ID/$PRIMARY_REGION

# bootstrap dev environment for CloudFormation (primary and secondary regions)
cdk bootstrap --profile $DEV_PROFILE --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess --trust $CICD_ACCOUNT_ID aws://$DEV_ACCOUNT_ID/$PRIMARY_REGION aws://$DEV_ACCOUNT_ID/$SECONDARY_REGION

# bootstrap test environment for CloudFormation (primary and secondary regions)
cdk bootstrap --profile $TEST_PROFILE --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess --trust $CICD_ACCOUNT_ID aws://$TEST_ACCOUNT_ID/$PRIMARY_REGION aws://$TEST_ACCOUNT_ID/$SECONDARY_REGION

# bootstrap prod environment for CloudFormation (primary and secondary regions)
cdk bootstrap --profile $PROD_PROFILE --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess --trust $CICD_ACCOUNT_ID aws://$PROD_ACCOUNT_ID/$PRIMARY_REGION aws://$PROD_ACCOUNT_ID/$SECONDARY_REGION

# deploy the main pipeline
cdk --profile $CICD_PROFILE deploy PipelineStack

