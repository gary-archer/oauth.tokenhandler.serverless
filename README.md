# Serverless Token Handler

A reverse proxy hosting a back end for front end to support the [Final SPA](https://github.com/gary-archer/oauth.websample.final) code sample.

## Token Handler Pattern

Curity's [Token Handler Pattern](https://github.com/curityio/spa-using-token-handler) is used, to separate web and API concerns.

## OpenID Connect

This is implemented by an `OAuth Agent`, which runs in an API driven manner, then returns `SameSite=strict` cookies to the browser.

## API Calls

During API calls, `OAuth Proxy` logic executes, to decrypt cookies and forward access tokens to APIs. 

## Blog Post

See the `Token Handler` blog post for architecture details on the setup.
