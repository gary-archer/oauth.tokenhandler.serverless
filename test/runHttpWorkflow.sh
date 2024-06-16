#!/bin/bash

##################################################################
# A script to test the deployed OAuth Agent and also deployed APIs
##################################################################


LOGIN_BASE_URL='https://login.authsamples.com'
COOKIE_PREFIX=authsamples
TEST_USERNAME='guestuser@example.com'
TEST_PASSWORD=GuestPassword1
RESPONSE_FILE='test/response.txt'
LOGIN_COOKIES_FILE='test/login_cookies.txt'
MAIN_COOKIES_FILE='test/main_cookies.txt'
# export HTTPS_PROXY='http://127.0.0.1:8888'

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
# Check prerequisites
#
jq --version 1>/dev/null
if [ "$?" != '0' ]; then
  echo '*** Please install the jq tool before running this script'
  exit
fi

#
# Set stage specific URLs
STAGE="$1"
if [ "$STAGE" == 'dev' ]; then

  # Use the deployed endpoints to support SPA development
  WEB_BASE_URL='https://www.authsamples-dev.com'
  OAUTH_AGENT_BASE_URL='https://bff.authsamples-dev.com/oauth-agent'
  API_BASE_URL='https://bff.authsamples-dev.com/investments'
else

  # Use the deployed endpoints that the deployed SPA uses
  WEB_BASE_URL='https://www.authsamples.com'
  OAUTH_AGENT_BASE_URL='https://bff.authsamples.com/oauth-agent'
  API_BASE_URL='https://bff.authsamples.com/investments'
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
echo '1. OPTIONS request for an invalid route ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$OAUTH_AGENT_BASE_URL/badpath" \
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
HTTP_STATUS=$(curl -i -s -X OPTIONS "$OAUTH_AGENT_BASE_URL/investments/companies" \
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
echo '3. OPTIONS request for a trusted origin ...'
HTTP_STATUS=$(curl -i -s -X OPTIONS "$OAUTH_AGENT_BASE_URL/login/start" \
-H "origin: $WEB_BASE_URL" \
-H "access-control-request-headers: x-authsamples-api-client,x-authsamples-session-id" \
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
if [ "$ALLOWED_HEADERS" != 'x-authsamples-api-client,x-authsamples-session-id' ]; then
  echo '*** OPTIONS request for a trusted origin returned an unexpected allow-headers header'
  exit
fi

#
# Verify that a GET request for an invalid route returns a 401 error
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
# Act as the SPA by calling the OAuth Agent to start a login and get the request URI
#
echo '5. Creating login URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/login/start" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a login, status: $HTTP_STATUS"
  exit
fi

JSON=$(tail -n 1 $RESPONSE_FILE)
AUTHORIZATION_REQUEST_URL=$(jq -r .authorizationRequestUrl <<< "$JSON")

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

LOGIN_POST_LOCATION=$(getHeaderValue 'location')
COGNITO_XSRF_TOKEN=$(getCookieValue 'XSRF-TOKEN' | cut -d ' ' -f 2)

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

AUTHORIZATION_RESPONSE_URL=$(getHeaderValue 'location')

#
# Next we end the login by asking the server to do an authorization code grant
#
echo '8. Finishing the login by processing the authorization code ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/login/end" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-d '{"pageUrl":"'$AUTHORIZATION_RESPONSE_URL'"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered ending a login, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Get the CSRF token which should be present after a successful login
#
JSON=$(tail -n 1 $RESPONSE_FILE)
CSRF_TOKEN=$(jq -r .csrf <<< "$JSON")
if [ "$CSRF_TOKEN" == 'null' ]; then
  echo "*** End login did not complete successfully"
  exit
fi

#
# Verify that a GET request to APIs returns valid data
#
echo '9. GET request with a valid access cookie returns JSON data ...'
HTTP_STATUS=$(curl -i -s -X GET "$API_BASE_URL/companies" \
-H "origin: $WEB_BASE_URL" \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request with a valid access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Verify that a GET request to APIs to rehearse exceptions returns the expected error
#
echo '10. Failed GET request returns correct rehearsed 500 error response ...'
HTTP_STATUS=$(curl -i -s -X GET "$API_BASE_URL/companies" \
-H "origin: $WEB_BASE_URL" \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-H 'x-authsamples-test-exception: SampleApi' \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '500' ]; then
  echo "*** Failed GET request returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Get user info
#
echo '11. GET request for user info with a valid access cookie returns JSON data ...'
HTTP_STATUS=$(curl -i -s -X GET "$OAUTH_AGENT_BASE_URL/userinfo" \
-H "origin: $WEB_BASE_URL" \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request for user info returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Get ID token claims
#
echo '12. Get ID token claims with a valid ID cookie returns JSON data ...'
HTTP_STATUS=$(curl -i -s -X GET "$OAUTH_AGENT_BASE_URL/claims" \
-H "origin: $WEB_BASE_URL" \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** GET request for ID token claims returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next expire the access token in the secure cookie, for test purposes
#
echo '13. Expiring the access token ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/access/expire" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $CSRF_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the access token, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Verify that an expired access token returns 401 when sent to APIs
#
echo '14. GET request with an expired access cookie returns 401 ...'
HTTP_STATUS=$(curl -i -s -X GET "$API_BASE_URL/companies" \
-H "origin: $WEB_BASE_URL" \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request to API with an expired access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Verify that an expired access token returns 401 when sent to the OAuth user info endpoint
#
echo '15. GET request for user info with an expired access cookie returns 401 ...'
HTTP_STATUS=$(curl -i -s -X GET "$OAUTH_AGENT_BASE_URL/userinfo" \
-H "origin: $WEB_BASE_URL" \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** GET request for user info with an expired access cookie returned an unexpected HTTP status: $HTTP_STATUS"
  apiError "$BODY"
  exit
fi

#
# Next try to refresh the access token
#
echo '16. Calling refresh to get a new access token ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/refresh" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $CSRF_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered refreshing the access token, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Next expire both the access token and refresh token in the secure cookies, for test purposes
#
echo '17. Expiring the refresh token ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/refresh/expire" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $CSRF_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '204' ]; then
  echo "*** Problem encountered expiring the refresh token, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Next try to refresh the token and we should get a session_expired error
#
echo '18. Trying to refresh the access token when the session is expired ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/refresh" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $CSRF_TOKEN" \
-b "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '401' ]; then
  echo "*** The expected 401 error did not occur, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Do a new login so that we can test logout
#
echo '19. Creating login URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/login/start" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-c "$MAIN_COOKIES_FILE" \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered starting a login, status: $HTTP_STATUS"
  exit
fi

JSON=$(tail -n 1 $RESPONSE_FILE)
AUTHORIZATION_REQUEST_URL=$(jq -r .authorizationRequestUrl <<< "$JSON")

#
# Next invoke the redirect URI to start a login
# The Cognito CSRF cookie is written twice due to following the redirect, so get the second occurrence
#
echo '20. Following login redirect ...'
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
# We can now post a password credential, and the form fields used are Cognito specific
#
echo '21. Posting credentials to sign in the test user ...'
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
# Next we end the login by asking the server to do an authorization code grant
#
echo '22. Finishing the login by processing the authorization code ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/login/end" \
-H "origin: $WEB_BASE_URL" \
-H 'content-type: application/json' \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-b "$MAIN_COOKIES_FILE" \
-c "$MAIN_COOKIES_FILE" \
-d '{"pageUrl":"'$AUTHORIZATION_RESPONSE_URL'"}' \
-o $RESPONSE_FILE -w '%{http_code}')
if [ "$HTTP_STATUS" != '200' ]; then
  echo "*** Problem encountered ending a login, status: $HTTP_STATUS"
  apiError
  exit
fi

#
# Get the CSRF token which should be present after a successful login
#
JSON=$(tail -n 1 $RESPONSE_FILE)
CSRF_TOKEN=$(jq -r .csrf <<< "$JSON")
if [ "$CSRF_TOKEN" == 'null' ]; then
  echo "*** End login did not complete successfully"
  exit
fi

#
# Next make a logout request
#
echo '23. Calling logout to clear cookies and get the end session request URL ...'
HTTP_STATUS=$(curl -i -s -X POST "$OAUTH_AGENT_BASE_URL/logout" \
-H "origin: $WEB_BASE_URL" \
-H 'accept: application/json' \
-H 'x-authsamples-api-client: httpTest' \
-H "x-authsamples-session-id: $SESSION_ID" \
-H "x-$COOKIE_PREFIX-csrf: $CSRF_TOKEN" \
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
END_SESSION_REQUEST_URL=$(jq -r .url <<< "$JSON")
