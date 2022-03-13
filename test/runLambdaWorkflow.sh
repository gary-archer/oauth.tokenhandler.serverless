#!/bin/bash

#########################################################################
# A script to test lambda logic running locally on a development computer
#########################################################################

WEB_BASE_URL='https://web.authsamples-dev.com'
LOGIN_BASE_URL='https://login.authsamples.com'
COOKIE_PREFIX=mycompany
TEST_USERNAME='guestuser@mycompany.com'
TEST_PASSWORD=GuestPassword1
SESSION_ID=$(uuidgen)
REQUEST_FILE=test/request.txt
RESPONSE_FILE=test/response.txt
SLS=./node_modules/.bin/sls
#export HTTPS_PROXY='http://127.0.0.1:8888'

cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# A simple routine to get a header value from an HTTP response file in a direct Cognito request
# The sed expression matches everything after the colon, after which we return this in group 1
#
function getCognitoHeaderValue(){
  local _HEADER_NAME=$1
  local _HEADER_VALUE=$(cat $RESPONSE_FILE | grep -i "^$_HEADER_NAME" | sed -r "s/^$_HEADER_NAME: (.*)$/\1/i")
  local _HEADER_VALUE=${_HEADER_VALUE%$'\r'}
  echo $_HEADER_VALUE
}

#
# Similar to the above except that we read a cookie value from an HTTP response file in a direct Cognito request
# This currently only supports a single cookie in each set-cookie header, which is good enough for my purposes
#
function getCognitoCookieValue(){
  local _COOKIE_NAME=$1
  local _COOKIE_VALUE=$(cat $RESPONSE_FILE | grep -i "set-cookie: $_COOKIE_NAME" | sed -r "s/^set-cookie: $_COOKIE_NAME=(.[^;]*)(.*)$/\1/i")
  local _COOKIE_VALUE=${_COOKIE_VALUE%$'\r'}
  echo $_COOKIE_VALUE
}

#
# Get a cookie name passed in the first argument from the multi value headers passed in the second
#
function getLambdaResponseCookieValue(){
  
  local _COOKIE_TEXT=$(jq -r --arg NAME "$1" '."set-cookie"[] | select(. | contains($NAME))' <<< "$2")
  local _COOKIE_VALUE=$(echo $_COOKIE_TEXT | sed -r "s/^$1=(.[^;]*)(.*)$/\1/")
  echo $_COOKIE_VALUE
}

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

echo "*** Session ID is $SESSION_ID"

#
# Write the input file for the startLogin request
#
jo -p \
path=/oauth-agent/login/start \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID) \
> $REQUEST_FILE

#
# Call startLogin
#
echo "*** Creating login URL ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered invoking the startLogin lambda"
  exit
fi

#
# Read the response data and handle failures
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a login, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Get values we will use later
#
AUTHORIZATION_REQUEST_URL=$(jq -r .authorizationRequestUri <<< "$BODY")
STATE_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-state" "$MULTI_VALUE_HEADERS")

#
# Next invoke the redirect URI to start a login
#
echo "*** Following login redirect ..."
HTTP_STATUS=$(curl -i -L -s "$AUTHORIZATION_REQUEST_URL" -o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered using the OpenID Connect authorization URL, status: $HTTP_STATUS"
  exit
fi

#
# Get data we will use in order to post test credentials and automate a login
# The Cognito CSRF cookie is written twice due to following the redirect, so get the second occurrence
#
LOGIN_POST_LOCATION=$(getCognitoHeaderValue 'location')
COGNITO_XSRF_TOKEN=$(getCognitoCookieValue 'XSRF-TOKEN' | cut -d ' ' -f 2)

#
# We can now post a password credential, and the form fields used are Cognito specific
#
echo "*** Posting credentials to sign in the test user ..."
HTTP_STATUS=$(curl -i -s -X POST "$LOGIN_POST_LOCATION" \
-H "origin: $LOGIN_BASE_URL" \
--cookie "XSRF-TOKEN=$COGNITO_XSRF_TOKEN" \
--data-urlencode "_csrf=$COGNITO_XSRF_TOKEN" \
--data-urlencode "username=$TEST_USERNAME" \
--data-urlencode "password=$TEST_PASSWORD" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '302' ]; then
  echo "*** Problem encountered posting a credential to AWS Cognito, status: $HTTP_STATUS"
  exit
fi

#
# Next get the response
#
AUTHORIZATION_RESPONSE_URL=$(getCognitoHeaderValue 'location')

#
# Next write the input file for the end login request, and it is tricky to write body parameters as lambda expects
#
jo \
path=/oauth-agent/login/end \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
content-type=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID) \
multiValueHeaders=$(jo cookie=$(jo -a "$COOKIE_PREFIX-state=$STATE_COOKIE")) \
body="{\\\""url\\\"":\\\""$AUTHORIZATION_RESPONSE_URL\\\""}" \
| sed 's/\\\\\\/\\/g' \
| jq > $REQUEST_FILE

#
# Call the endLogin lambda and redirect the output
#
echo "*** Finishing the login by processing the authorization code ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered invoking the endLogin lambda"
  exit
fi

#
# Read the response data and handle failures
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered ending a login, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Get values we will use shortly
#
ACCESS_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-at" "$MULTI_VALUE_HEADERS")
REFRESH_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-rt" "$MULTI_VALUE_HEADERS")
ID_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-id" "$MULTI_VALUE_HEADERS")
CSRF_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-csrf" "$MULTI_VALUE_HEADERS")
ANTI_FORGERY_TOKEN=$(jq -r .antiForgeryToken <<< "$BODY")

#
# Create the request to call the expire endpoint, then expire the access token
#
jo -p \
path='/oauth-agent/expire' \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
content-type=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID \
"x-$COOKIE_PREFIX-csrf=$ANTI_FORGERY_TOKEN") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE" \
"$COOKIE_PREFIX-csrf=$CSRF_COOKIE")) \
body="{\\\""type\\\"":\\\""access\\\""}" \
| sed 's/\\\\\\/\\/g' \
| jq > $REQUEST_FILE

#
# Ask the API to write the access token in the cookie with extra characters, then get the updated cookie
#
echo "*** Expiring the access token ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the access token"
  exit
fi

#
# Handle failures then read the response data
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the access token, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
ACCESS_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-at" "$MULTI_VALUE_HEADERS")

#
# Write a request to refresh the access token
#
jo -p \
path='/oauth-agent/refresh' \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
content-type=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID \
"x-$COOKIE_PREFIX-csrf=$ANTI_FORGERY_TOKEN") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE" \
"$COOKIE_PREFIX-csrf=$CSRF_COOKIE")) \
| jq > $REQUEST_FILE

#
# Send a request to refresh the access token in the secure cookie
#
echo "*** Refreshing the access token ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the access token"
  exit
fi

#
# Handle failures then read the response data
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the access token, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
ACCESS_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-at" "$MULTI_VALUE_HEADERS")
REFRESH_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-rt" "$MULTI_VALUE_HEADERS")

#
# Create the request to call the expire endpoint, then expire both the refresh token and the access token
#
jo -p \
path='/oauth-agent/expire' \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
content-type=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID \
"x-$COOKIE_PREFIX-csrf=$ANTI_FORGERY_TOKEN") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE" \
"$COOKIE_PREFIX-csrf=$CSRF_COOKIE")) \
body="{\\\""type\\\"":\\\""refresh\\\""}" \
| sed 's/\\\\\\/\\/g' \
| jq > $REQUEST_FILE

#
# Ask the API to make both the refresh token and secure token act expired
#
echo "*** Expiring the refresh token ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the refresh token"
  exit
fi

#
# Handle failures then read the response data
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the refresh token, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi
ACCESS_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-at" "$MULTI_VALUE_HEADERS")
REFRESH_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-rt" "$MULTI_VALUE_HEADERS")

#
# Write a request to refresh the access token
#
jo -p \
path='/oauth-agent/refresh' \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
content-type=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID \
"x-$COOKIE_PREFIX-csrf=$ANTI_FORGERY_TOKEN") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE" \
"$COOKIE_PREFIX-csrf=$CSRF_COOKIE")) \
| jq > $REQUEST_FILE

#
# Send a request to refresh the access token in the secure cookie
#
echo "*** Trying to refresh the access token when the session is expired ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the access token"
  exit
fi

#
# Handle failures then read the response data
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** Problem encountered invoking the access lambda, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next write a request to get an end session request from the API
#
jo -p \
path='/oauth-agent/logout' \
httpMethod=POST \
headers=$(jo origin="$WEB_BASE_URL" \
accept=application/json \
content-type=application/json \
x-mycompany-api-client=lambdaTest \
x-mycompany-session-id=$SESSION_ID \
"x-$COOKIE_PREFIX-csrf=$ANTI_FORGERY_TOKEN") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE" \
"$COOKIE_PREFIX-csrf=$CSRF_COOKIE")) \
| jq > $REQUEST_FILE

#
# Next start a logout request
#
echo "*** Calling logout to clear cookies and get the end session request URL ..."
$SLS invoke local -f wildcard -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered invoking the startLogout lambda"
  exit
fi

#
# Check for the expected result
#
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a logout, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# The real SPA will then do a logout redirect with this URL
#
END_SESSION_REQUEST_URL=$(jq -r .endSessionRequestUri <<< "$BODY")
