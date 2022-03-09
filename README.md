# Serverless Token Handler

A back end for front end to support my [Final SPA](https://github.com/gary-archer/oauth.websample.final) code sample.\
The result is to keep OAuth tokens out of the browser, in line with current best practices.

## Token Handler Pattern

Curity's [Token Handler Pattern](https://github.com/curityio/spa-using-token-handler) is used, to separate web and API concerns.\

## OpenID Connect

`OAuth Agent` logic implements this in an API driven manner, then returns `SameSite=strict` cookies to the browser.

## API Calls

During API calls `OAuth Proxy` logic executes in order to decrypt cookies and forward access tokens to APIs. 

## Blog Post

See the `Serverless Token Handler` blog post for further details on the AWS setup.
