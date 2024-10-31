#!/bin/bash

#########################################################################
# A script to test lambda logic running locally on a development computer
#########################################################################

WEB_BASE_URL='https://www.authsamples-dev.com'
LOGIN_BASE_URL='https://login.authsamples.com'
COOKIE_PREFIX=authsamples
TEST_USERNAME='guestuser@example.com'
TEST_PASSWORD=GuestPassword1
REQUEST_FILE='test/request.txt'
RESPONSE_FILE='test/response.txt'
LOGIN_COOKIES_FILE='test/login_cookies.txt'
SLS=./node_modules/.bin/sls
# export HTTPS_PROXY='http://127.0.0.1:8888'

#
# Ensure that we are in the root folder
#
cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# A simple routine to get a header value from an HTTP response file in a direct Cognito request
# The sed expression matches everything after the colon, after which we return this in group 1
#
function getCognitoHeaderValue() {
  local _HEADER_NAME=$1
  local _HEADER_VALUE=$(cat $RESPONSE_FILE | grep -i "^$_HEADER_NAME" | sed -r "s/^$_HEADER_NAME: (.*)$/\1/i")
  local _HEADER_VALUE=${_HEADER_VALUE%$'\r'}
  echo $_HEADER_VALUE
}

#
# Similar to the above except that we read a cookie value from an HTTP response file in a direct Cognito request
# This currently only supports a single cookie in each set-cookie header, which is good enough for my purposes
#
function getCognitoCookieValue() {
  local _COOKIE_NAME=$1
  local _COOKIE_VALUE=$(cat $RESPONSE_FILE | grep -i "set-cookie: $_COOKIE_NAME" | sed -r "s/^set-cookie: $_COOKIE_NAME=(.[^;]*)(.*)$/\1/i")
  local _COOKIE_VALUE=${_COOKIE_VALUE%$'\r'}
  echo $_COOKIE_VALUE
}

#
# Get a cookie name passed in the first argument from the multi value headers passed in the second
#
function getLambdaResponseCookieValue() {
  
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

#
# Check prerequisites
#
jq --version 1>/dev/null
if [ "$?" != '0' ]; then
  echo '*** Please install the jq tool before running this script'
  exit
fi
jo -version 1>/dev/null
if [ "$?" != '0' ]; then
  echo '*** Please install the jo tool before running this script'
  exit
fi

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
# Get a random session ID
#
if [ "$PLATFORM" == 'WINDOWS' ]; then
  SESSION_ID=$(powershell -command $"[guid]::NewGuid().ToString()")
else
  SESSION_ID=$(uuidgen)
fi

#
# Verify that an OPTIONS request for an invalid route returns 204
#
jo \
httpMethod='OPTIONS' \
path='\/badpath' \
| jq > $REQUEST_FILE

echo '1. OPTIONS request for an invalid route ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
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

#
# Next verify that an OPTIONS request for an untrusted origin does not return CORS headers
#
jo \
httpMethod='OPTIONS' \
path='\/investments/companies' \
headers=$(jo origin='https://badsite.com') \
| jq > $REQUEST_FILE

echo '2. OPTIONS request for an untrusted origin ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
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

#
# Act as the SPA by sending an OPTIONS request, then verifying that we get the expected results
#
jo \
httpMethod='OPTIONS' \
path='\/investments/companies' \
headers=$(jo origin="$WEB_BASE_URL" \
access-control-request-headers='x-authsamples-api-client,x-authsamples-session-id') \
| jq > $REQUEST_FILE

echo '3. OPTIONS request for a trusted origin ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
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
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-origin header'
  exit
fi
ALLOW_CREDENTIALS=$(jq -r '.headers."access-control-allow-credentials"' <<< "$JSON")
if [ "$ALLOW_CREDENTIALS" != 'true' ]; then
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-credentials header'
  exit
fi
ALLOWED_HEADERS=$(jq -r '.headers."access-control-allow-headers"' <<< "$JSON")
if [ "$ALLOWED_HEADERS" != 'x-authsamples-api-client,x-authsamples-session-id' ]; then
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-headers header'
  exit
fi

#
# Verify that a GET request for an invalid route returns a 404 error
#
jo \
httpMethod='GET' \
path='\/badpath' \
headers=$(jo -- -s "token-handler-version=1") \
| jq > $REQUEST_FILE

echo '4. GET request with an invalid route ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request with a valid access cookie failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '404' ]; then
  echo "*** GET request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Act as the SPA by calling the OAuth Agent to start a login and get the request URI
#
jo -p \
path='\/oauth-agent/login/start' \
httpMethod='POST' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept=application/json \
token-handler-version=1 \
x-authsamples-api-client=lambdaTest \
x-authsamples-session-id=$SESSION_ID) \
> $REQUEST_FILE

echo '5. Creating login URL ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered invoking the startLogin lambda"
  exit
fi

JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a login, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

AUTHORIZATION_REQUEST_URL=$(jq -r .authorizationRequestUrl <<< "$BODY")
STATE_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-state" "$MULTI_VALUE_HEADERS")

#
# Next invoke the redirect URI to start a login
# The Cognito CSRF cookie is written twice due to following the redirect, so get the second occurrence
#
echo '6. Following login redirect ...'
HTTP_STATUS=$(curl -i -L -s "$AUTHORIZATION_REQUEST_URL" \
-c "$LOGIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered using the OpenID Connect authorization URL, status: $HTTP_STATUS"
  exit
fi

LOGIN_POST_LOCATION=$(getCognitoHeaderValue 'location')
COGNITO_XSRF_TOKEN=$(getCognitoCookieValue 'XSRF-TOKEN' | cut -d ' ' -f 2)

#
# We can now post a password credential, and the form fields used are Cognito specific
#
echo '7. Posting credentials to sign in the test user ...'
HTTP_STATUS=$(curl -i -s -X POST "$LOGIN_POST_LOCATION" \
-H "origin: $LOGIN_BASE_URL" \
-b "$LOGIN_COOKIES_FILE" \
--data-urlencode "_csrf=$COGNITO_XSRF_TOKEN" \
--data-urlencode "username=$TEST_USERNAME" \
--data-urlencode "password=$TEST_PASSWORD" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '302' ]; then
  echo "*** Problem encountered posting a credential to AWS Cognito, status: $HTTP_STATUS"
  exit
fi

AUTHORIZATION_RESPONSE_URL=$(getCognitoHeaderValue 'location')

#
# Next we end the login by asking the server to do an authorization code grant
#
jo \
path='\/oauth-agent/login/end' \
httpMethod='POST' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a "$COOKIE_PREFIX-state=$STATE_COOKIE")) \
body="{\\\""pageUrl\\\"":\\\""$AUTHORIZATION_RESPONSE_URL\\\""}" \
| sed 's/\\\\\\/\\/g' \
| jq > $REQUEST_FILE

echo '8. Finishing the login by processing the authorization code ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered invoking the endLogin lambda"
  exit
fi

JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
MULTI_VALUE_HEADERS=$(jq -r .multiValueHeaders <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered ending a login, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

ACCESS_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-at" "$MULTI_VALUE_HEADERS")
REFRESH_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-rt" "$MULTI_VALUE_HEADERS")
ID_COOKIE=$(getLambdaResponseCookieValue "$COOKIE_PREFIX-id" "$MULTI_VALUE_HEADERS")

#
# Verify that a GET request to APIs returns valid data
#
jo \
httpMethod='GET' \
path='\/investments/companies' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a "$COOKIE_PREFIX-at=$ACCESS_COOKIE")) \
| jq > $REQUEST_FILE

echo '9. GET request with a valid access cookie returns JSON data ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
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

#
# Use the error simulation custom header to verify that 500 errors return the expected data
#
jo \
httpMethod='GET' \
path='\/investments/companies' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-test-exception='FinalApi' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a "$COOKIE_PREFIX-at=$ACCESS_COOKIE")) \
| jq > $REQUEST_FILE

echo '10. Failed GET request returns correct rehearsed 500 error response ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request for a 500 error failed to execute'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '500' ]; then
  echo "*** Failed GET request returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Get user info with the access token
#
jo -p \
path='\/oauthuserinfo' \
httpMethod='GET' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| jq > $REQUEST_FILE

echo '11. GET request for user info with a valid access cookie returns JSON data ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request for user info failed to execute'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request for user info returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Get ID token claims with the access token
#
jo -p \
path='\/oauth-agent/claims' \
httpMethod='GET' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| jq > $REQUEST_FILE

echo '12. Get ID token claims returns the expected 200 response ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request for ID token claims failed to execute'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request for ID token claims returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next simulate expiring the access token in the secure cookie
#
jo -p \
path='\/oauth-agent/access/expire' \
httpMethod='POST' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| sed 's/\\\\\\/\\/g' \
| jq > $REQUEST_FILE

echo '13. Expiring the access token ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the access token"
  exit
fi

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
# Verify that an expired API call returns a 401
#
jo \
httpMethod='GET' \
path='\/investments/companies' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a "$COOKIE_PREFIX-at=$ACCESS_COOKIE")) \
| jq > $REQUEST_FILE

echo '14. GET request with a valid access cookie returns JSON data ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request with a valid access cookie failed'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request with a valid access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Verify that an expired user info call returns a 401
#
jo -p \
path='\/oauthuserinfo' \
httpMethod='GET' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| jq > $REQUEST_FILE

echo '15. GET request for user info with a valid access cookie returns JSON data ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo 'GET request for user info failed to execute'
  exit
fi
JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request for user info returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next try to refresh the access token
#
jo -p \
path='\/oauth-agent/refresh' \
httpMethod='POST' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| jq > $REQUEST_FILE

echo '16. Calling refresh to get a new access token ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the access token"
  exit
fi

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
# Next expire both the access token and refresh token in the secure cookies, for test purposes
#
jo -p \
path='\/oauth-agent/refresh/expire' \
httpMethod=POST \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| sed 's/\\\\\\/\\/g' \
| jq > $REQUEST_FILE

echo '17. Expiring the refresh token ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the refresh token"
  exit
fi

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
# Next try to refresh the token and we should get a session_expired error
#
jo -p \
path='\/oauth-agent/refresh' \
httpMethod='POST' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo -a cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| jq > $REQUEST_FILE

echo '18. Trying to refresh the access token when the session is expired ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered expiring the access token"
  exit
fi

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
# Next make a logout request
#
jo -p \
path='\/oauth-agent/logout' \
httpMethod='POST' \
headers=$(jo -- -s origin="$WEB_BASE_URL" \
accept='application/json' \
content-type='application/json' \
token-handler-version=1 \
x-authsamples-api-client='lambdaTest' \
x-authsamples-session-id="$SESSION_ID") \
multiValueHeaders=$(jo cookie=$(jo -a \
"$COOKIE_PREFIX-at=$ACCESS_COOKIE" \
"$COOKIE_PREFIX-rt=$REFRESH_COOKIE" \
"$COOKIE_PREFIX-id=$ID_COOKIE")) \
| jq > $REQUEST_FILE

echo '19. Calling logout to clear cookies and get the end session request URL ...'
$SLS invoke local -f wildcard --stage dev -p $REQUEST_FILE > $RESPONSE_FILE
if [ "$?" != '0' ]; then
  echo "*** Problem encountered invoking the startLogout lambda"
  exit
fi

JSON=$(cat $RESPONSE_FILE)
HTTP_STATUS=$(jq -r .statusCode <<< "$JSON")
BODY=$(jq -r .body <<< "$JSON")
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a logout, status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

END_SESSION_REQUEST_URL=$(jq -r .url <<< "$BODY")
