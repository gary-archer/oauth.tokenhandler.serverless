# Serverless Token Handler

[![Known Vulnerabilities](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless/badge.svg?targetFile=package.json)](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless?targetFile=package.json)

## Scenarios

The components are deployed in these main scenarios:

- To secure local SPA development, via deployed endpoints hosted at https://bff.authsamples-dev.com.
- To secure the AWS Cloudfront deployed SPA, via deployed endpoints hosted at https://bff.authsamples.com.

## Development

First ensure that Node.js 20+ is installed, then run the following command.\
This tests lambda logic locally using `sls invoke -f local` operations:

```bash
./start.sh
```
