import {chromium} from 'playwright';
import {OAuthAgentClient} from './oauthAgentClient.js';

// Values that are the same for both local and deployed token handlers
const TEST_USERNAME = 'guestuser@example.com';
const TEST_PASSWORD = 'GuestPassword1';
const LOGIN_CALLBACK_URL = 'https://www.authsamples-dev.com/spa/callback';

// Point to a particular token handler
const BFF_BASE_URL = 'https://bfflocal.authsamples-dev.com:444';

try {

    // Get the authorization request URL
    const oauthAgentClient = new OAuthAgentClient(BFF_BASE_URL);
    const authorizationRequestUrl = await oauthAgentClient.startLogin();

    // Run the login and get the response URL
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(authorizationRequestUrl);
    await page.getByPlaceholder('name@host.com').fill(TEST_USERNAME);
    await page.getByPlaceholder('Enter password').fill(TEST_PASSWORD);

    const callbackPromise = new Promise(
        resolve => {
            page.route(
                `${LOGIN_CALLBACK_URL}**`,
                async route => {
                    await route.abort();
                    resolve(route.request().url());
                },
            );
        },
    );

    await page.getByRole('button', { name: /sign in/i }).click();
    const authorizationResponseUrl = await callbackPromise as string;
    browser.close();

    // End the login
    const idTokenClaims = await oauthAgentClient.endLogin(authorizationResponseUrl);
    console.log(idTokenClaims);

} catch (e: any) {

    // Report errors
    console.log(e.message);
}
