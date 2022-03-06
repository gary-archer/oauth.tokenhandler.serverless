#!/bin/bash

############################################
# A script to test the reverse proxy locally
############################################

REQUEST_FILE=test/request.txt
RESPONSE_FILE=test/response.txt
SLS=./node_modules/.bin/sls
#export HTTPS_PROXY='http://127.0.0.1:8888'

#
# Move home
#
cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# Render an error result returned from the API
#
function apiError() {

  local _CODE=$(jq -r .code <<< "$1")
  local _MESSAGE=$(jq -r .message <<< "$1")

  if [ "$_CODE" != 'null'  ] && [ "$_MESSAGE" != 'null' ]; then
    echo "*** Code: $_CODE, Message: $_MESSAGE"
  fi
}

#
# Build a request with an invalid route
#
jo \
httpMethod=GET \
path=/badpath \
| jq > $REQUEST_FILE

#
# Execute the invalid route request
#
echo 'Calling reverse proxy with an invalid route ...'
$SLS invoke local -f reverseProxy -p $REQUEST_FILE > $RESPONSE_FILE
if [ $? -ne 0 ]; then
  echo 'Problem encountered invoking the reverse proxy with an invalid route'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ $HTTP_STATUS -ne '401' ]; then
  echo "*** A request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo 'Request for an invalid route was handled successfully'

#
# Build a request with a valid route
#
jo \
httpMethod=GET \
path=/api/companies \
| jq > $REQUEST_FILE

#
# Execute the valid route request but without credentials
#
echo 'Calling reverse proxy with a valid route ...'
$SLS invoke local -f reverseProxy -p $REQUEST_FILE > $RESPONSE_FILE
if [ $? -ne 0 ]; then
  echo 'Problem encountered invoking the reverse proxy with a valid route'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ $HTTP_STATUS -ne '401' ]; then
  echo "*** A request with a valid route did not returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo 'Request for a valid route was handled successfully'
