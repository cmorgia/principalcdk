#!/bin/sh

export CICD_PROFILE=$(jq -r .context.cicd.profile <cdk.json)
export DEV_PROFILE=$(jq -r .context.dev.profile <cdk.json)
export TEST_PROFILE=$(jq -r .context.test.profile <cdk.json)
export PROD_PROFILE=$(jq -r .context.prod.profile <cdk.json)

export CICD_ACCOUNT_ID=$(aws --profile $CICD_PROFILE sts get-caller-identity | jq -r .Account)
export DEV_ACCOUNT_ID=$(aws --profile $DEV_PROFILE sts get-caller-identity | jq -r .Account)
export TEST_ACCOUNT_ID=$(aws --profile $TEST_PROFILE sts get-caller-identity | jq -r .Account)
export PROD_ACCOUNT_ID=$(aws --profile $PROD_PROFILE sts get-caller-identity | jq -r .Account)

jq '.context.cicd.account = env.CICD_ACCOUNT_ID' cdk.json > cdk.temp.json && mv cdk.temp.json cdk.json
jq '.context.dev.account = env.DEV_ACCOUNT_ID' cdk.json > cdk.temp.json && mv cdk.temp.json cdk.json
jq '.context.test.account = env.TEST_ACCOUNT_ID' cdk.json > cdk.temp.json && mv cdk.temp.json cdk.json
jq '.context.prod.account = env.PROD_ACCOUNT_ID' cdk.json > cdk.temp.json && mv cdk.temp.json cdk.json