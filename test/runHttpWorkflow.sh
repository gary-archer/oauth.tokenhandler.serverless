#!/bin/bash

###################################################
# A script to test the reverse proxy running in AWS
###################################################

WEB_BASE_URL='https://web.authsamples-dev.com'
TOKEN_HANDLER_BASE_URL='https://tokenhandler.authsamples-dev.com'
COOKIE_PREFIX=mycompany
RESPONSE_FILE=response.txt
CREDENTIALS_FILE=credentials.json
#export HTTPS_PROXY='http://127.0.0.1:8888'

cd "$(dirname "${BASH_SOURCE[0]}")"

#
# Read a header value from the response
#
function getHeaderValue(){
  local _HEADER_NAME=$1
  local _HEADER_VALUE=$(cat $RESPONSE_FILE | grep -i "^$_HEADER_NAME" | sed -r "s/^$_HEADER_NAME: (.*)$/\1/i")
  local _HEADER_VALUE=${_HEADER_VALUE%$'\r'}
  echo $_HEADER_VALUE
}

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
# Check preconditions
#
if [ ! -f './credentials.json' ]; then
  echo "*** First execute 'npm run setup' to generate cookie credentials for testing"
  exit 1
fi

#
# Verify an OPTIONS request for an invalid route
#
echo '1. OPTIONS request for an invalid route ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$TOKEN_HANDLER_BASE_URL/badpath" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** A request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '1. OPTIONS request for an invalid route was handled correctly'

#
# Verify that an OPTIONS request for an untrusted origin does not return CORS headers
#
echo '2. OPTIONS request for an untrusted origin ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$TOKEN_HANDLER_BASE_URL/api/companies" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** OPTIONS request for an untrusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  exit
fi
ALLOW_ORIGIN=$(getHeaderValue 'access-control-allow-origin')
if [ "$ALLOW_ORIGIN" != '' ]; then
  echo '*** OPTIONS request for an untrusted origin returned CORS headers unexpectedly'
  exit
fi
echo '2. OPTIONS request for an untrusted origin was handled correctly'

#
# Verify that an OPTIONS request for a trusted origin returns correct CORS headers
#
echo '3. OPTIONS request for a trusted origin ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$TOKEN_HANDLER_BASE_URL/api/companies" \
-H "origin: $WEB_BASE_URL" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** OPTIONS request for a trusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  exit
fi
ALLOW_ORIGIN=$(getHeaderValue 'access-control-allow-origin')
if [ "$ALLOW_ORIGIN" != "$WEB_BASE_URL" ]; then
  echo '*** OPTIONS request for an untrusted origin returned an unexpected allow-origin header'
  exit
fi
ALLOW_CREDENTIALS=$(getHeaderValue 'access-control-allow-credentials')
if [ "$ALLOW_CREDENTIALS" != 'true' ]; then
  echo '*** OPTIONS request for an untrusted origin returned an unexpected allow-credentials header'
  exit
fi
echo '3. OPTIONS request for an trusted origin was handled correctly'

#
# Verify that a GET request for an invalid route returns a 404 error
#
echo '4. GET request with an invalid route ...'
HTTP_STATUS=$(curl -i -s -X GET "$TOKEN_HANDLER_BASE_URL/badpath" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ $HTTP_STATUS -ne '404' ]; then
  echo "*** GET request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '4. GET request with an invalid route was handled correctly'

#
# Verify that a GET request for an untrusted origin returns a 401 error
#
echo '5. GET request with an untrusted origin ...'
HTTP_STATUS=$(curl -i -s -X GET "$TOKEN_HANDLER_BASE_URL/api/companies" \
-H "origin: https://badsite.com" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request with an untrusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '5. GET request with an untrusted origin was handled correctly'

#
# Verify that a GET request with an error returns readable error responses
#
echo '6. GET request with a trusted origin ...'
HTTP_STATUS=$(curl -i -s -X GET "$TOKEN_HANDLER_BASE_URL/api/companies" \
-H "origin: $WEB_BASE_URL" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request with a trusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
ALLOW_ORIGIN=$(getHeaderValue 'access-control-allow-origin')
if [ "$ALLOW_ORIGIN" != "$WEB_BASE_URL" ]; then
  echo '*** GET request with a trusted origin returned an unexpected allow-origin header'
  exit
fi
echo '6. GET request with a trusted origin received a readable error response'

#
# Read credentials created via 'npm run setup'
#
JSON=$(cat $CREDENTIALS_FILE)
ACCESS_COOKIE=$(jq -r .accessCookie <<< "$JSON")

#
# Verify that a GET request with an error returns readable error responses
#
echo '7. GET request with a valid access cookie returns JSON data ...'
HTTP_STATUS=$(curl -i -s -X GET "$TOKEN_HANDLER_BASE_URL/api/companies" \
-H "origin: $WEB_BASE_URL" \
-H "cookie: $COOKIE_PREFIX-at=$ACCESS_COOKIE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request with a valid access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '7. GET request with a valid access cookie was handled correctly'
