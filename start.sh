#!/bin/bash

#################################
# A script to run lambdas locally
#################################

cd "$(dirname "${BASH_SOURCE[0]}")"

#
# Get the platform
#
case "$(uname -s)" in

  Darwin)
    PLATFORM="MACOS"
 	;;

  MINGW64*)
    PLATFORM="WINDOWS"
	;;

  Linux)
    PLATFORM="LINUX"
	;;
esac

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
# Build the API code
#
npm run build
if [ $? -ne 0 ]; then
  echo 'Problem encountered building the API'
  exit
fi

#
# Run the lambda workflow
#
npm run lambda
if [ $? -ne 0 ]; then
  exit
fi