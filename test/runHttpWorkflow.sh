#!/bin/bash

##################################################################
# A script to test the deployed OAuth Agent and also deployed APIs
##################################################################


LOGIN_BASE_URL='https://login.authsamples.com'
COOKIE_PREFIX=mycompany
TEST_USERNAME='guestuser@mycompany.com'
TEST_PASSWORD=GuestPassword1
RESPONSE_FILE='test/response.txt'
LOGIN_COOKIES_FILE='test/login_cookies.txt'
MAIN_COOKIES_FILE='test/main_cookies.txt'

#
# Ensure that we are in the root folder
#
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
# Used to read a Cognito token from a cookie
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
# Set stage specific URLs
#
STAGE="$1"
if [ "$STAGE" == 'dev' ]; then
  
  # Use the deployed endpoints to support SPA development
  WEB_BASE_URL='https://web.authsamples-dev.com'
  OAUTH_AGENT_BASE_URL='https://tokenhandler.authsamples-dev.com/oauth-agent'
  API_BASE_URL='https://tokenhandler.authsamples-dev.com/api'
else

  # Use the deployed endpoints that the deployed SPA uses
  WEB_BASE_URL='https://web.authsamples.com'
  OAUTH_AGENT_BASE_URL='https://tokenhandler.authsamples.com/oauth-agent'
  API_BASE_URL='https://tokenhandler.authsamples.com/api'
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
# 1. Verify that an OPTIONS request for an invalid route returns 204
#
echo '1. OPTIONS request for an invalid route ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$OAUTH_AGENT_BASE_URL/badpath" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** A request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# 2. Next verify that an OPTIONS request for an untrusted origin does not return CORS headers
#
echo '2. OPTIONS request for an untrusted origin ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$OAUTH_AGENT_BASE_URL/api/companies" \
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
# 3. Act as the SPA by sending an OPTIONS request, then verifying that we get the expected results
#
echo '3. OPTIONS request for a trusted origin ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$OAUTH_AGENT_BASE_URL/login/start" \
-H "origin: $WEB_BASE_URL" \
-H "access-control-request-headers: x-mycompany-api-client,x-mycompany-session-id" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204'  ]; then
  echo "*** Problem encountered requesting cross origin access, status: $HTTP_STATUS"
  exit
fi
ALLOW_ORIGIN=$(getHeaderValue 'access-control-allow-origin')
if [ "$ALLOW_ORIGIN" != "$WEB_BASE_URL" ]; then
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-origin header'
  exit
fi
ALLOW_CREDENTIALS=$(getHeaderValue 'access-control-allow-credentials')
if [ "$ALLOW_CREDENTIALS" != 'true' ]; then
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-credentials header'
  exit
fi
ALLOWED_HEADERS=$(getHeaderValue 'access-control-allow-headers')
if [ "$ALLOWED_HEADERS" != 'x-mycompany-api-client,x-mycompany-session-id' ]; then
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-headers header'
  exit
fi

#
# 4. Verify that a GET request for an invalid route returns a 401 error
#
echo '4. GET request with an invalid route ...'
HTTP_STATUS=$(curl -i -s -X GET "$OAUTH_AGENT_BASE_URL/badpath" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ $HTTP_STATUS -ne '401' ]; then
  echo "*** GET request with an invalid route returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# 5. Act as the SPA by calling the OAuth Agent to start a login and get the request URI
#
echo '5. Creating login URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/login/start" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a login, status: $HTTP_STATUS"
  exit
fi

JSON=$(tail -n 1 $RESPONSE_FILE)
AUTHORIZATION_REQUEST_URL=$(jq -r .authorizationRequestUri <<< "$JSON")

#
# 6. Next invoke the redirect URI to start a login
#    The Cognito CSRF cookie is written twice due to following the redirect, so get the second occurrence
#
echo '6. Following login redirect ...'
HTTP_STATUS=$(curl -i -L -s "$AUTHORIZATION_REQUEST_URL" \
-c "$LOGIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered using the OpenID Connect authorization URL, status: $HTTP_STATUS"
  exit
fi

LOGIN_POST_LOCATION=$(getHeaderValue 'location')
COGNITO_XSRF_TOKEN=$(getCookieValue 'XSRF-TOKEN' | cut -d ' ' -f 2)

#
# 7. We can now post a password credential, and the form fields used are Cognito specific
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

AUTHORIZATION_RESPONSE_URL=$(getHeaderValue 'location')

#
# 8. Next we end the login by asking the server to do an authorization code grant
#
echo '8. Finishing the login by processing the authorization code ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/login/end" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-d '{"url":"'$AUTHORIZATION_RESPONSE_URL'"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered ending a login, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Get the anti forgery token which should be present after a successful login
#
JSON=$(tail -n 1 $RESPONSE_FILE)
ANTI_FORGERY_TOKEN=$(jq -r .antiForgeryToken <<< "$JSON")
if [ "$ANTI_FORGERY_TOKEN" == 'null' ]; then
  echo "*** End login did not complete successfully"
  exit
fi

#
# 9. Verify that a GET request to APIs returns valid data
#
echo '9. GET request with a valid access cookie returns JSON data ...'
HTTP_STATUS=$(curl -i -s -X GET "$API_BASE_URL/companies" \
-H "origin: $WEB_BASE_URL" \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request with a valid access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# 10. Verify that a GET request to APIs returns valid data
#
echo '10. Failed GET request returns expected 500 error response ...'
HTTP_STATUS=$(curl -i -s -X GET "$API_BASE_URL/companies" \
-H "origin: $WEB_BASE_URL" \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H 'x-mycompany-test-exception: SampleApi' \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '500' ]; then
  echo "*** Failed GET request returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# 11. Next expire the access token in the secure cookie, for test purposes
#
echo '11. Expiring the access token ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/expire" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-d '{"type":"access"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the access token, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# 12. Next try to refresh the access token
#
echo '12. Calling refresh to get a new access token ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/refresh" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered refreshing the access token, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# 13. Next expire both the access token and refresh token in the secure cookies, for test purposes
#
echo '13. Expiring the refresh token ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/expire" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-d '{"type":"refresh"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the refresh token, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# 14. Next try to refresh the token and we should get an invalid_grant error
#
echo '14. Trying to refresh the access token when the session is expired ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/refresh" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** The expected 401 error did not occur, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# 15. Next make a logout request
#
echo '15. Calling logout to clear cookies and get the end session request URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/logout" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-mycompany-api-client: httpTest' \
-H "x-mycompany-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $ANTI_FORGERY_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
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
