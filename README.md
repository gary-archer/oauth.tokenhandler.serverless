# OAuth Serverless Reverse Proxy

A demo level reverse proxy to deal with cookie concerns for a Single Page Application.\
The goal of the repo is to demonstrate the preferred architectural routing, to separate concerns.

## Modern Web Security

The [Final SPA](https://github.com/gary-archer/oauth.websample.final) uses Curity's [Token Handler Pattern](https://github.com/curityio/web-oauth-via-bff) and makes OAuth and API requests via the reverse proxy.\
All CORS and cookie related logic is implemented here before routing requests to the target API.

## OAuth Proxy

For API routes, some `OAuth Proxy` logic runs to decrypt cookies, then forwards an access token to the API.\
For data changing requests, the OAuth Proxy also makes additional CSRF checks.