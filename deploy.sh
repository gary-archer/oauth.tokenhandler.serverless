#!/bin/bash

###################################
# A script to deploy lambdas to AWS
###################################

cd "$(dirname "${BASH_SOURCE[0]}")"
SLS='./node_modules/.bin/sls'

#
# Get the stage being deployed
#
STAGE="$1"
if [ "$STAGE" != 'dev' ]; then
  STAGE='deployed'
fi

#
# Install dependencies if needed
#
if [ ! -d 'node_modules' ]; then
  npm install
  if [ $? -ne 0 ]; then
    echo 'Problem encountered installing dependencies'
    exit
  fi
fi

#
# Do a release build of the API code
#
npm run buildRelease
if [ $? -ne 0 ]; then
  echo 'Problem encountered building the code'
  exit
fi

#
# Ensure that the correct deployed configuration is in the root folder
#
cp "environments/config.$STAGE.json" ./config.json

#
# Do the packaging
#
rm -rf .serverless
"$SLS" package --stage "$STAGE"
if [ $? -ne 0 ]; then
  echo 'Problem encountered building the AWS package'
  exit
fi

#
# Do the deployment
#
"$SLS" deploy --stage "$STAGE" --package .serverless
if [ $? -ne 0 ]; then
  echo 'Problem encountered deploying the AWS package'
  exit
fi

#
# Finally restore the local development configuration
#
cp environments/config.local.json ./config.json
