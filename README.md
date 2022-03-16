# Serverless Token Handler

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/bc52d166f1624ef9a2c0cfbf283deb23)](https://www.codacy.com/gh/gary-archer/oauth.tokenhandler.serverless/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=gary-archer/oauth.tokenhandler.serverless&amp;utm_campaign=Badge_Grade)

[![Known Vulnerabilities](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless/badge.svg?targetFile=package.json)](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless?targetFile=package.json)

Utility API support for a Single Page Application, to enable OpenID Connect security and use of secure cookies.\
The [Final SPA](https://github.com/gary-archer/oauth.websample.final) uses Curity's [Token Handler Pattern](https://github.com/curityio/spa-using-token-handler) and calls this API to perform OAuth related work.

## Custom Implementation

This repo provides an OAuth Agent and OAuth Proxy, which is deployed to AWS in a low cost manner to support the SPA.\
Two separate instances are deployed:

- A token handler to support local development
- A token handler to support the deployed SPA

It enables my [End-to-end SPA and API](https://github.com/gary-archer/oauth.cloudnative.deployment) to run with the desired behaviour in both setups.

## Quick Start

To run this component in isolation, run these commands to build the API code:

```bash
./start.sh
```

Then test API operations locally via this command, which runs lambda functions:

```bash
npm run lambda
```

Test deployed API endpoints via this command:

```bash
npm run http
```
