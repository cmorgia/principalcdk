#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { AppStack } from '../lib/cdk-stack';
import { Config, EnvConfig, ReplicaConfig } from '../lib/config';
import { PipelineStack } from '../lib/pipeline';
import { ReplicaStack } from '../lib/replica-stack';

const app = new cdk.App();

function ensureString(object: { [name: string]: any }, propName: string): string {
  if (!object[propName] || object[propName].trim().length === 0)
    throw new Error(propName + " does not exist or is empty");

  return object[propName];
}

/* this function is responsible for fetching the configuration of the specified environment
   (i.e. dev, test, prod) from the cdk.json file so no configuration aspect is hardcoded in the
   source code
   In order to simplify the configuration section in the cdk.json file, there is a common
   section that is inherited by all the top level sections (i.e. dev, test and prod)
   */
function getConfig(env?:string) {
  let _env = env ?? app.node.tryGetContext('config');
  if (!_env)
    throw new Error("Context variable missing on CDK command. Pass in as `-c config=XXX`");

  let unparsedCommon = app.node.tryGetContext('common');
  let unparsedSpecific = app.node.tryGetContext(_env);
  let unparsedEnv = {...unparsedCommon, ...unparsedSpecific};

  let buildConfig: EnvConfig = {
    environment: _env,
    account: ensureString(unparsedEnv, 'account'),
    primaryCidr: ensureString(unparsedEnv, 'primaryCidr'),
    secondaryCidr: ensureString(unparsedEnv, 'secondaryCidr'),
    primaryRegion: ensureString(unparsedEnv, 'primaryRegion'),
    secondaryRegion: ensureString(unparsedEnv, 'secondaryRegion'),
    enableRedis: ensureString(unparsedEnv, 'enableRedis')=="true",
    enableAurora: ensureString(unparsedEnv, 'enableAurora')=="true"
  };

  return buildConfig;
}

/* this is a special version of the previous function, specifically designed for the
   configuration section dedicated to the CICD pipeline
   Note that we don't use the EnvConfig class but we declare an inline dictionary
   */
function getCicdConfig(env?:string) {
  let unparsedCommon = app.node.tryGetContext('common');
  let unparsedSpecific = app.node.tryGetContext('cicd');
  let unparsedEnv = {...unparsedCommon, ...unparsedSpecific};

  let buildConfig: {[key:string]: string} = {
    account: ensureString(unparsedEnv, 'account'),
    primaryRegion: ensureString(unparsedEnv, 'primaryRegion'),
    secondaryRegion: ensureString(unparsedEnv, 'secondaryRegion'),
    enableRedis: ensureString(unparsedEnv, 'enableRedis'),
    enableAurora: ensureString(unparsedEnv, 'enableAurora')
  };

  return buildConfig;
}

/* behavior is defined according to the config context argument (-c context='???')
   possible value are:
   - 'cicd', used for the pipeline setup
   - 'dev', 'test', 'prod', for direct deployment of the specific environment
   in case the config argument is missed, cicd is assumed 
   */

// if no config parameter is specified, it is assumed to target the 'cicd' environment
let _config = app.node.tryGetContext('config');
if (_config==undefined) {
  _config = 'cicd';
}

/* when direct deployment, all stacks are added to the application, letting the CDK
   wrapper decide with one to deploy, according to the stack name provided as
   argument to the command line
   typically cdk -c config=dev <stack name> 
   */
if (_config!='cicd') {
  const config = getConfig(_config);

  const primaryConfig:Config = {
    primary: true,
    cidr: config.primaryCidr,
    primaryRegion: config.primaryRegion,
    secondaryRegion: config.secondaryRegion,
    enableRedis: config.enableRedis,
    enableAurora: config.enableAurora
  };
  
  const secondaryConfig:Config = {
    primary: false,
    cidr: config.secondaryCidr,
    primaryRegion: config.secondaryRegion,
    secondaryRegion: config.primaryRegion,
    enableRedis: config.enableRedis,
    enableAurora: config.enableAurora
  };

  const primary = new AppStack(app, 'PrimaryStack', {
    env: { account: config.account, region: primaryConfig.primaryRegion }
  },primaryConfig);
  
  const secondary = new AppStack(app, 'FailoverStack', {
    env: { account: config.account, region: secondaryConfig.secondaryRegion }
  },secondaryConfig);
  
  const replicaConfig:ReplicaConfig = {
    primaryRegion: secondaryConfig.primaryRegion,
    secondaryRegion: secondaryConfig.secondaryRegion
  };
  
  const replication = new ReplicaStack(app, 'ReplicaStack', {
    env: { account: config.account, region: primaryConfig.secondaryRegion }
  }, replicaConfig);
} else {
  // in case of cicd, a pipeline stack is created and the configured envs
  // are added to the pipeline
  const config = getCicdConfig();

  const primaryConfig:Config = {
    primary: true,
    cidr: config.primaryCidr,
    primaryRegion: config.primaryRegion,
    secondaryRegion: config.secondaryRegion,
    enableRedis: config.enableRedis=="true",
    enableAurora: config.enableAurora=="true"
  };

  new PipelineStack(app, 'PipelineStack', {
    env: { account: config.account, region: primaryConfig.primaryRegion }
  }, {
    'dev': getConfig('dev'),
    'test': getConfig('test'),
    'prod': getConfig('prod')
  });
}
