# OAuth Cookie Proxy

A utility to receive secure cookies from Single Page Application and route access tokens to APIs.

## Modern Web Security

The [Final SPA](https://github.com/gary-archer/oauth.websample.final) uses Curity's [Token Handler Pattern](https://github.com/curityio/web-oauth-via-bff) and calls this API to perform OAuth related work.

## Implementation

An AWS Serverless implementation that performs the following actions:

- Listens on the API entry point for the SPA, at https://api-spa.authsamples.com/api
- Allows the SPA to make a cross origin request to the cookie entry point, via CORS headers
- Verifies the origin header as a trusted web origin
- For data changing commands, make double submit cookie checks as a CSRF defense in depth
- Decrypts secure cookies to get access tokens
- Forwards access tokens to the real API, at https://api-spa.authsamples.com/api
