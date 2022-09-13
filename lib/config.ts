import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Bucket } from "aws-cdk-lib/aws-s3";

export interface EnvConfig {
    readonly environment: string;
    readonly account: string;
    readonly primaryCidr: string;
    readonly secondaryCidr: string;
    readonly primaryRegion: string;
    readonly secondaryRegion: string;
    readonly enableRedis: boolean;
    readonly enableAurora: boolean;
};
export interface Config {
    readonly primary: boolean;
    readonly cidr:string;
    readonly primaryRegion: string;
    readonly secondaryRegion: string;
    readonly enableRedis: boolean;
    readonly enableAurora: boolean;
};

export interface ReplicaConfig {
    readonly primaryRegion: string;
    readonly secondaryRegion: string;
};