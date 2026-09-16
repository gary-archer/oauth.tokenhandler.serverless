# Serverless Token Handler

An API-driven backend for frontend for an SPA, with low cost AWS hosting.  
The token handler provides cookie security for this blog's final OAuth-secured SPA.  

## Run the Token Handler

Use Serverless Offline to run the token handler as a local API:

```bash
./start.sh
```

## Test the Token Handler

Install a UI test framework that can do browser logins, which AWS Cognito requires:

```bash
npx playwright install-deps
npx playwright install
```

Then use the following command to test the cookie lifecycle:

```bash
npm test
```

## Deploy the Token Handler

Use the following command to deploy the token handler to AWS for the subdomain `bff.authsamples-dev.com`:

```bash
npm run deployDev
```

Use the following command to deploy the token handler to AWS for the subdomain `bff.authsamples.com`:

```bash
npm run deploy
```
