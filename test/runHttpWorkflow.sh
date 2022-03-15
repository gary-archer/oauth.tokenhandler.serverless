#!/bin/bash

#####################################################################
# A script to test the deployed lambdas running as AWS HTTP endpoints
#####################################################################

WEB_BASE_URL='https://web.authsamples-dev.com'
TOKEN_HANDLER_BASE_URL='https://tokenhandler.authsamples-dev.com'
LOGIN_BASE_URL='https://login.authsamples.com'
COOKIE_PREFIX=mycompany
TEST_USERNAME='guestuser@mycompany.com'
TEST_PASSWORD=GuestPassword1
SESSION_ID=$(uuidgen)
RESPONSE_FILE=test/response.txt
#export HTTPS_PROXY='http://127.0.0.1:8888'

cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# A simple routine to get a header value from an HTTP response file
# The sed expression matches everything after the colon, after which we return this in group 1
#
function getHeaderValue(){
  local _HEADER_NAME=$1
  local _HEADER_VALUE=$(cat $RESPONSE_FILE | grep -i "^$_HEADER_NAME" | sed -r "s/^$_HEADER_NAME: (.*)$/\1/i")
  local _HEADER_VALUE=${_HEADER_VALUE%$'\r'}
  echo $_HEADER_VALUE
}

#
# Similar to the above except that we read a cookie value from an HTTP response file
# This currently only supports a single cookie in each set-cookie header, which is good enough for my purposes
#
function getCookieValue(){
  local _COOKIE_NAME=$1
  local _COOKIE_VALUE=$(cat $RESPONSE_FILE | grep -i "set-cookie: $_COOKIE_NAME" | sed -r "s/^set-cookie: $_COOKIE_NAME=(.[^;]*)(.*)$/\1/i")
  local _COOKIE_VALUE=${_COOKIE_VALUE%$'\r'}
  echo $_COOKIE_VALUE
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
# Start an authenticated user session
#
echo "*** Session ID is $SESSION_ID"

#
# First make an OPTIONS request for an invalid route
#
echo '1. OPTIONS request for an invalid route ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$TOKEN_HANDLER_BASE_URL/badpath" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** A request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next verify that an OPTIONS request for an untrusted origin does not return CORS headers
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

#
# Act as the SPA by sending an OPTIONS request, then verifying that we get the expected results
#
echo '3. Requesting cross origin access'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$TOKEN_HANDLER_BASE_URL/oauth-agent/login/start" \
-H "origin: $WEB_BASE_URL" \
-H "access-control-request-headers: x-mycompany-api-client, x-mycompany-session-id" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204'  ]; then
  echo "*** Problem encountered requesting cross origin access, status: $HTTP_STATUS"
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
ALLOWED_HEADERS=$(getHeaderValue 'access-control-allow-headers')
if [ "$ALLOWED_HEADERS" != 'x-mycompany-api-client, x-mycompany-session-id' ]; then
  echo '*** OPTIONS request for an untrusted origin returned an unexpected allow-headers header'
  exit
fi

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

#
# Act as the SPA by calling the OAuth Agent to start a login and get the request URI
#
echo '5. Creating login URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/login/start" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a login, status: $HTTP_STATUS"
  exit
fi

#
# Get data we will use later
#
JSON=$(tail -n 1 $RESPONSE_FILE)
AUTHORIZATION_REQUEST_URL=$(jq -r .authorizationRequestUri <<< "$JSON")
STATE_COOKIE=$(getCookieValue "$COOKIE_PREFIX-state")

#
# Next invoke the redirect URI to start a login
#
echo '6. Following login redirect ...'
HTTP_STATUS=$(curl -i -L -s "$AUTHORIZATION_REQUEST_URL" -o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered using the OpenID Connect authorization URL, status: $HTTP_STATUS"
  exit
fi

#
# Get data we will use in order to post test credentials and automate a login
# The Cognito CSRF cookie is written twice due to following the redirect, so get the second occurrence
#
LOGIN_POST_LOCATION=$(getHeaderValue 'location')
COGNITO_XSRF_TOKEN=$(getCookieValue 'XSRF-TOKEN' | cut -d ' ' -f 2)

#
# We can now post a password credential, and the form fields used are Cognito specific
#
echo '7. Posting credentials to sign in the test user ...'
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
# Next get the response URL
#
AUTHORIZATION_RESPONSE_URL=$(getHeaderValue 'location')

#
# Next we end the login by asking the server to do an authorization code grant
#
echo '8. Finishing the login by processing the authorization code ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/login/end" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
--cookie "$COOKIE_PREFIX-state=$STATE_COOKIE" \
-d '{"url":"'$AUTHORIZATION_RESPONSE_URL'"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered ending a login, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Get data that we will use later
#
JSON=$(tail -n 1 $RESPONSE_FILE)
ANTI_FORGERY_TOKEN=$(jq -r .antiForgeryToken <<< "$JSON")
ACCESS_COOKIE=$(getCookieValue "$COOKIE_PREFIX-at")
REFRESH_COOKIE=$(getCookieValue "$COOKIE_PREFIX-rt")
ID_COOKIE=$(getCookieValue "$COOKIE_PREFIX-id")
CSRF_COOKIE=$(getCookieValue "$COOKIE_PREFIX-csrf")

#
# Verify that a GET request with an error returns readable error responses
#
echo '9. GET request with a valid access cookie returns JSON data ...'
HTTP_STATUS=$(curl -i -s -X GET "$TOKEN_HANDLER_BASE_URL/api/companies" \
-H "origin: $WEB_BASE_URL" \
-H "cookie: $COOKIE_PREFIX-at=$ACCESS_COOKIE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request with a valid access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next expire the access token in the secure cookie, for test purposes
#
echo '10. Expiring the access token ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/expire" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
--cookie "$COOKIE_PREFIX-at=$ACCESS_COOKIE;$COOKIE_PREFIX-rt=$REFRESH_COOKIE;$COOKIE_PREFIX-id=$ID_COOKIE;$COOKIE_PREFIX-csrf=$CSRF_COOKIE" \
-d '{"type":"access"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the access token, status: $HTTP_STATUS"
  apiError
  exit
fi
ACCESS_COOKIE=$(getCookieValue "$COOKIE_PREFIX-at")

#
# Next try to refresh the access token
#
echo '11. Calling refresh to get a new access token ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/refresh" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
--cookie "$COOKIE_PREFIX-rt=$REFRESH_COOKIE;$COOKIE_PREFIX-id=$ID_COOKIE;$COOKIE_PREFIX-csrf=$CSRF_COOKIE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered refreshing the access token, status: $HTTP_STATUS"
  apiError
  exit
fi
ACCESS_COOKIE=$(getCookieValue "$COOKIE_PREFIX-at")
REFRESH_COOKIE=$(getCookieValue "$COOKIE_PREFIX-rt")
ID_COOKIE=$(getCookieValue "$COOKIE_PREFIX-id")

#
# Next expire both the access token and refresh token in the secure cookies, for test purposes
#
echo '12. Expiring the refresh token ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/expire" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
--cookie "$COOKIE_PREFIX-at=$ACCESS_COOKIE;$COOKIE_PREFIX-rt=$REFRESH_COOKIE;$COOKIE_PREFIX-id=$ID_COOKIE;$COOKIE_PREFIX-csrf=$CSRF_COOKIE" \
-d '{"type":"refresh"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the refresh token, status: $HTTP_STATUS"
  apiError
  exit
fi
ACCESS_COOKIE=$(getCookieValue "$COOKIE_PREFIX-at")
REFRESH_COOKIE=$(getCookieValue "$COOKIE_PREFIX-rt")

#
# Next try to refresh the token and we should get an invalid_grant error
#
echo '13. Trying to refresh the access token when the session is expired ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/refresh" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
--cookie "$COOKIE_PREFIX-rt=$REFRESH_COOKIE;$COOKIE_PREFIX-id=$ID_COOKIE;$COOKIE_PREFIX-csrf=$CSRF_COOKIE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** The expected 401 error did not occur, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Next make a logout request
#
echo '14. Calling logout to clear cookies and get the end session request URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$TOKEN_HANDLER_BASE_URL/oauth-agent/logout" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
--cookie "$COOKIE_PREFIX-rt=$REFRESH_COOKIE;$COOKIE_PREFIX-id=$ID_COOKIE;$COOKIE_PREFIX-csrf=$CSRF_COOKIE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered calling logout, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# The real SPA will then do a logout redirect with this URL
#
JSON=$(tail -n 1 $RESPONSE_FILE)
END_SESSION_REQUEST_URL=$(jq -r .endSessionRequestUri <<< "$JSON")
