#!/bin/bash

###################################################
# A script to test the reverse proxy running in AWS
###################################################

TOKEN_HANDLER_BASE_URL='https://tokenhandler.authsamples-dev.com'
RESPONSE_FILE=test/response.txt
#export HTTPS_PROXY='http://127.0.0.1:8888'

cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# Render an error result returned from the API
#
function apiError() {

  local _JSON=$(tail -n 1 $RESPONSE_FILE)
  local _CODE=$(jq -r .code <<< "$_JSON")
  local _MESSAGE=$(jq -r .message <<< "$_JSON")
  
  if [ "$_CODE" != 'null'  ] && [ "$_MESSAGE" != 'null' ]; then
    echo "*** Code: $_CODE, Message: $_MESSAGE"
  fi
}

#
# Execute a request for a route with an invalid path
#
echo 'Calling reverse proxy with an invalid route ...'
HTTP_STATUS=$(curl -i -s "$TOKEN_HANDLER_BASE_URL/badpath" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** A request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo 'Request for an invalid route was handled successfully'

#
# Execute a request for a valid route but without a credential
#
echo 'Calling reverse proxy with a valid route but no credential ...'
HTTP_STATUS=$(curl -i -s "$TOKEN_HANDLER_BASE_URL/api/companies" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** A request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo 'Request for a valid route with a missing credential was handled successfully'