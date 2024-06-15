# Serverless Token Handler

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/a180220195dd4500b324a4f87644add4)](https://app.codacy.com/gh/gary-archer/oauth.tokenhandler.serverless?utm_source=github.com&utm_medium=referral&utm_content=gary-archer/oauth.tokenhandler.serverless&utm_campaign=Badge_Grade)

[![Known Vulnerabilities](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless/badge.svg?targetFile=package.json)](https://snyk.io/test/github/gary-archer/oauth.tokenhandler.serverless?targetFile=package.json)

Single page application security components, referenced in my blog at https://authguidance.com:

- The **Token Handler Pattern** is followed, to keep security complexity out of application code
- Deployed AWS endpoints provide an application level secure cookie layer for SPAs
- An OAuth Agent acts as a confidential OAuth Client for the SPA, and to issue its cookies
- An OAuth Proxy manages web security during calls to APIs

## Scenarios

The components are deployed in these main scenarios:

- To secure local SPA development, via deployed endpoints hosted at https://bff.authsamples-dev.com
- To secure the AWS Cloudfront deployed SPA, via deployed endpoints hosted at https://api.authsamples.com

## Custom Implementation

This implementation provides a low cost lambda based solution that can be hosted in AWS.\
A single wildcard lambda implements both the OAuth Agent and OAuth Proxy roles.

The OAuth Agent also has some custom expiry testing and Elasticsearch logging behaviour.\
These relate to my blog's reliability and supportability behaviours.

## Development

First ensure that Node.js 20+ is installed, then run the following command.\
This tests lambda logic locally using `sls invoke -f local` operations:

```bash
./start.sh
```

## Programming Technologies

* Node.js and TypeScript are used to implement the Serverless lambda

## Cloud Infrastructure Used

* AWS Route 53 is used for custom hosting domains
* AWS Certificate Manager is used to manage and auto renew the SSL certificate for the token handler domain
* AWS Cognito is used as the default Authorization Server
* The AWS API Gateway is used as the HTTPS internet entry point
* CloudWatch is used for immediate storage of OAuth Agent logs
* Logs are aggregated to [Elastic Cloud](https://authguidance.com/cloud-elastic-search-setup) to support common [Query Use Cases](https://authguidance.com/api-technical-support-analysis/)
