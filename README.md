# Serverless Token Handler

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/bc52d166f1624ef9a2c0cfbf283deb23)](https://www.codacy.com/gh/gary-archer/oauth.tokenhandler.serverless/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=gary-archer/oauth.tokenhandler.serverless&amp;utm_campaign=Badge_Grade)

[![Known Vulnerabilities](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless/badge.svg?targetFile=package.json)](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless?targetFile=package.json)

AWS deployed endpoints that implement an application level cookie layer for single page applications.\
The [Final SPA](https://github.com/gary-archer/oauth.websample.final) uses Curity's [Token Handler Pattern](https://github.com/curityio/spa-using-token-handler) and calls these endpoints.

## Overview

This implementation has some custom logging and expiry testing behaviour.\
Two separate instances are deployed to to AWS, and run in a low cost manner:

- A token handler to support local SPA development runs at https://tokenhandler.authsamples-dev.com
- A token handler for the deployed system runs at https://tokenhandler.authsamples.com

The token handler manages these web back end concerns in an API driven manner:

- OpenID Connect
- Cookie issuing
- CORS and CSRF

## Development

To run this component in isolation, run the following command.\
This tests lambda logic locally using `sls invoke -f local` commands:

```bash
./start.sh
```

## Deployment

To test AWS endpoints for the two token handler deployments, run one of these commands:

```bash
npm run deployDev
npm run deploy
```

## HTTP Testing

To test AWS endpoints for the two token handler deployments, run one of these commands:

```bash
npm run httpDev
npm run http
```

## Further Information

See the [Final SPA to API Routing](https://authguidance.com/2019/04/08/serverless-spa-to-api-routing) blog post for further details on URLs and setup.

## Programming Technologies

* Node.js and TypeScript are used to implement an AWS wildcard lambda function

## Cloud Infrastructure Used

* AWS Route 53 is used for custom hosting domains
* AWS Certificate Manager is used to manage and auto renew the SSL certificate for the token handler domain
* AWS Cognito is used as the default Authorization Server
* The AWS API Gateway is used as the HTTPS internet entry point
* CloudWatch is used for immediate storage of OAuth Agent logs
* Logs are aggregated to [Elastic Cloud](https://authguidance.com/cloud-elastic-search-setup) to support common [Query Use Cases](https://authguidance.com/api-technical-support-analysis/)
