#!/bin/sh

export ARNS=$(aws cloudfront list-distributions --region eu-west-1 --query "DistributionList.Items[].ARN" --output text)
for arn in $ARNS ; do 
    if [ $(aws cloudfront list-tags-for-resource --resource $arn --query "Tags.Items[?Key=='DistributionName'].Value" --output text) == "TestDistribution" ] ; then
        DISTRIB=$(echo $arn | cut -d '/' -f 2)
    fi
done

export DOMAINNAME=$(aws cloudfront get-distribution --id $DISTRIB --query "Distribution.DomainName" | tr -d '"')
echo https://$DOMAINNAME/demo.html
echo https://$DOMAINNAME/static/demo.html