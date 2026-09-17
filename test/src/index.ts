import {chromium} from 'playwright';
import {OAuthClient} from './oauthClient.js';

// Values that are the same for both local and deployed token handlers
const TEST_USERNAME = 'guestuser@example.com';
const TEST_PASSWORD = 'GuestPassword1';
const WEB_BASE_URL = 'https://www.authsamples-dev.com';

// Point to either a local token handler or one running in AWS
const BFF_BASE_URL = 'https://bfflocal.authsamples-dev.com:444';

/*
 * Use the browser to test a login operation
 */
async function login(authorizationRequestUrl: string): Promise<string> {

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(authorizationRequestUrl);
    await page.getByPlaceholder('name@host.com').fill(TEST_USERNAME);
    await page.getByPlaceholder('Enter password').fill(TEST_PASSWORD);

    const callbackPromise = new Promise<string>(
        resolve => {
            page.route(
                `${WEB_BASE_URL}/spa/callback**`,
                async route => {
                    const url = route.request().url();
                    resolve(url);
                    await route.abort();
                },
            );
        },
    );

    await page.getByRole('button', { name: /sign in/i }).click();
    const result = await callbackPromise;
    browser.close();
    return result;
}

/*
 * Use the browser to test a logout operation
 */
async function logout(endSessionRequestUrl: string): Promise<void> {

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    const callbackPromise = new Promise<string>(
        resolve => {
            page.route(
                `${WEB_BASE_URL}/spa/loggedout**`,
                async route => {
                    const url = route.request().url();
                    resolve(url);
                    await route.abort();
                },
            );
        },
    );

    page.goto(endSessionRequestUrl).catch(() => {});
    await callbackPromise;
    browser.close();
}

try {

    // Get the authorization request URL
    console.log('Starting login ...');
    const oauthAgentClient = new OAuthClient(BFF_BASE_URL);
    const authorizationRequestUrl = await oauthAgentClient.startLogin();

    // Run the login and get the response URL
    console.log('Running a login on the system browser ...');
    const authorizationResponseUrl = await login(authorizationRequestUrl);

    // End the login
    console.log('Ending login ...');
    await oauthAgentClient.endLogin(authorizationResponseUrl);

    // Get OAuth user info
    console.log('Getting OAuth user info ...');
    await oauthAgentClient.userInfo();

    // Test refresh operations
    console.log('Testing expire operations ...');
    await oauthAgentClient.expireAccessToken();
    await oauthAgentClient.refresh();
    await oauthAgentClient.userInfo();
    await oauthAgentClient.expireRefreshToken();

    // Test logout
    console.log('Running a logout on the system browser ...');
    const endSessionRequestUrl = await oauthAgentClient.logout();
    await logout(endSessionRequestUrl);

} catch (e: any) {

    // Report errors
    console.log(e.message);
}
