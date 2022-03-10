#!/bin/bash

############################################
# A script to test the token handler locally
############################################

WEB_BASE_URL='https://web.authsamples-dev.com'
COOKIE_PREFIX=mycompany
REQUEST_FILE=test/request.txt
RESPONSE_FILE=test/response.txt
CREDENTIALS_FILE=test/credentials.json
SLS=./node_modules/.bin/sls

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
# Check preconditions
#
if [ ! -f "$CREDENTIALS_FILE" ]; then
  echo "*** First execute 'npm run setup' to generate cookie credentials for testing"
  exit 1
fi

#
# Verify that an OPTIONS request for an invalid route returns 204
#
jo \
httpMethod=OPTIONS \
path=/badpath \
| jq > $REQUEST_FILE

echo '1. OPTIONS request for an invalid route ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo '*** OPTIONS request for an invalid route failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** OPTIONS request for an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  exit
fi
echo '1. OPTIONS request for an invalid route was handled correctly'

#
# Verify that an OPTIONS request for an untrusted origin does not return CORS headers
#
jo \
httpMethod=OPTIONS \
path=/api/companies \
headers=$(jo origin="https://badsite.com") \
| jq > $REQUEST_FILE

echo '2. OPTIONS request for an untrusted origin ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo '*** OPTIONS request for an untrusted origin failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** OPTIONS request for an untrusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  exit
fi
ALLOW_ORIGIN=$(jq -r '.headers."access-control-allow-origin"' <<< "$JSON")
if [ "$ALLOW_ORIGIN" != 'null' ]; then
  echo '*** OPTIONS request for an untrusted origin returned CORS headers unexpectedly'
  exit
fi
echo '2. OPTIONS request for an untrusted origin was handled correctly'

#
# Verify that an OPTIONS request for a trusted origin returns correct CORS headers
#
jo \
httpMethod=OPTIONS \
path=/api/companies \
headers=$(jo origin="$WEB_BASE_URL") \
| jq > $REQUEST_FILE

echo '3. OPTIONS request for a trusted origin ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo '*** OPTIONS request for a trusted origin failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** OPTIONS request for a trusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  exit
fi
ALLOW_ORIGIN=$(jq -r '.headers."access-control-allow-origin"' <<< "$JSON")
if [ "$ALLOW_ORIGIN" != "$WEB_BASE_URL" ]; then
  echo '*** OPTIONS request for an untrusted origin returned an unexpected allow-origin header'
  exit
fi
ALLOW_CREDENTIALS=$(jq -r '.headers."access-control-allow-credentials"' <<< "$JSON")
if [ "$ALLOW_CREDENTIALS" != 'true' ]; then
  echo '*** OPTIONS request for an untrusted origin returned an unexpected allow-credentials header'
  exit
fi
echo '3. OPTIONS request for an trusted origin was handled correctly'

#
# Verify that a GET request for an invalid route returns a 404 error
#
jo \
httpMethod=GET \
path=/badpath \
| jq > $REQUEST_FILE

echo '4. GET request with an invalid route ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo '*** GET request with an invalid route failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ $HTTP_STATUS -ne '404' ]; then
  echo "*** GET request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '4. GET request with an invalid route was handled correctly'

#
# Verify that a GET request for an untrusted origin returns a 401 error
#
jo \
httpMethod=GET \
path=/api/companies \
headers=$(jo origin="https://badsite.com") \
| jq > $REQUEST_FILE

echo '5. GET request with an untrusted origin ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request with an untrusted origin failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request with an untrusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '5. GET request with an untrusted origin was handled correctly'

#
# Verify that a GET request with an error returns readable error responses
#
jo \
httpMethod=GET \
path=/api/companies \
headers=$(jo origin="$WEB_BASE_URL") \
| jq > $REQUEST_FILE

echo '6. GET request with a trusted origin ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request with a trusted origin failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request with a trusted origin returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
ALLOW_ORIGIN=$(jq -r '.headers."access-control-allow-origin"' <<< "$JSON")
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
# Verify that a GET request with a valid access cookie
#
jo \
httpMethod=GET \
path=/api/companies \
headers=$(jo origin="$WEB_BASE_URL") \
multiValueHeaders=$(jo cookie=$(jo -a "$COOKIE_PREFIX-at=$ACCESS_COOKIE")) \
| jq > $REQUEST_FILE

echo '7. GET request with a valid access cookie returns JSON data ...'
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request with a valid access cookie failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request with a valid access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
echo '7. GET request with a valid access cookie was handled correctly'
