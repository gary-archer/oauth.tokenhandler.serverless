#!/bin/bash

######################################################################
# A script to initiate testing of OAuth Agent and OAuth Proxy requests
######################################################################

cd "$(dirname "${BASH_SOURCE[0]}")"

#
# Delete any existing logs
#
rm -rf tokenhandler.log 2> /dev/null

#
# Tell Node.js to trust the CA, or the user can add this CA to their own trust file
#
if [ "$NODE_EXTRA_CA_CERTS" == '' ]; then
  export NODE_EXTRA_CA_CERTS='../certs/authsamples-dev.ca.crt'
fi

#
# Run the tests to trigger remote requests
#
tsx src/index.ts
