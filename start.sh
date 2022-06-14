#!/bin/bash

#################################
# A script to run lambdas locally
#################################

cd "$(dirname "${BASH_SOURCE[0]}")"

#
# Install dependencies if needed
#
if [ ! -d 'node_modules' ]; then
  npm install
  if [ $? -ne 0 ]; then
    echo 'Problem encountered installing API dependencies'
    exit
  fi
fi

#
# Check code quality
#
npm run lint
if [ $? -ne 0 ]; then
  echo 'Code quality problems encountered'
  exit
fi

#
# Build the API code
#
npm run build
if [ $? -ne 0 ]; then
  echo 'Problem encountered building the API'
  exit
fi

#
# Ensure that the local development configuration is in the root folder
#
cp environments/config.local.json ./config.json

#
# Run the test workflow against local code
#
./test/runLambdaWorkflow.sh