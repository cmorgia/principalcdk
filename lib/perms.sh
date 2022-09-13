#!/bin/bash
usermod -a -G www ec2-user
chown -R root:www /var/www
chmod 2775 /var/www
find /var/www -type d -exec chmod 2775 {} +
find /var/www -type f -exec chmod 0664 {} +

EC2_AVAIL_ZONE=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)
EC2_REGION=$(echo $EC2_AVAIL_ZONE | sed 's/[a-z]$//')
EC2_INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

cd /var/www/html
sed -i 's/%AWS_REGION%/'$EC2_REGION'/g' demo.html
sed -i 's/%EC2_INSTANCE_ID%/'$EC2_INSTANCE_ID'/g' demo.html

echo "Done"