# Serverless Token Handler

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/bc52d166f1624ef9a2c0cfbf283deb23)](https://www.codacy.com/gh/gary-archer/oauth.tokenhandler.serverless/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=gary-archer/oauth.tokenhandler.serverless&amp;utm_campaign=Badge_Grade)

[![Known Vulnerabilities](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless/badge.svg?targetFile=package.json)](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless?targetFile=package.json)

API Driven OpenID Connect for Single Page Applications.\
The [Final SPA](https://github.com/gary-archer/oauth.websample.final) uses Curity's [Token Handler Pattern](https://github.com/curityio/spa-using-token-handler) and calls this API to perform OAuth related work.

## Custom Implementation

This repo provides an OAuth Agent and OAuth Proxy with some custom expiry testing and logging behavior.\
Two separate instances are deployed to to AWS, and run in a low cost manner:

- Token handler components to support local development
- Token handler components used by the deployed SPA

## Quick Start

To run this component in isolation, run the following commands to build the API code:

```bash
npm install
npm run build
```

Then test API operations locally via this command, which runs lambda functions:

```bash
npm run lambda
```

Test AWS deployed API endpoints via this command:

```bash
npm run http
```

## Further Information

See the [Final SPA to API Routing](https://authguidance.com/2019/04/08/serverless-spa-to-api-routing) blog post for further details on the utility API components.

## Programming Technologies

* Node.js and TypeScript are used to implement an AWS wildcard lambda function

## Cloud Infrastructure Used

* AWS Route 53 is used for custom hosting domains
* AWS Certificate Manager is used to manage and auto renew the SSL certificate for the token handler domain
* AWS Cognito is used as the default Authorization Server
* The AWS API Gateway is used as the HTTPS internet entry point
* CloudWatch is used for immediate storage of OAuth Agent logs
* Logs are aggregated to [Elastic Cloud](https://authguidance.com/2020/08/11/cloud-elastic-search-setup) to support common [Query Use Cases](https://authguidance.com/2019/08/02/intelligent-api-platform-analysis/)
