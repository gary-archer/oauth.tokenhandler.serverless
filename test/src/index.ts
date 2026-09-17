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
    console.log('1. Starting login ...');
    const oauthClient = new OAuthClient(BFF_BASE_URL);
    const authorizationRequestUrl = await oauthClient.startLogin();

    // Run the login and get the response URL
    console.log('2. Running a login on the system browser ...');
    const authorizationResponseUrl = await login(authorizationRequestUrl);

    // End the login
    console.log('3. Ending login ...');
    await oauthClient.endLogin(authorizationResponseUrl);

    // Get OAuth user info
    console.log('4. Calling API ...');
    let userInfo = await oauthClient.userInfo();
    if (userInfo) {
        console.log('5. Successfully called API');
    }

    // Test refresh operations
    console.log('6. Testing expire access token ...');
    await oauthClient.expireAccessToken();
    userInfo = await oauthClient.userInfo();
    if (!userInfo) {

        console.log('7. Refreshing access token ...');
        const refreshed = await oauthClient.refresh();
        if (refreshed) {
            userInfo = await oauthClient.userInfo();
            if (userInfo) {
                console.log('8. Successfully retried API request');
            }
        }
    }

    console.log('9. Testing expire refresh token ...');
    await oauthClient.expireRefreshToken();
    userInfo = await oauthClient.userInfo();
    if (!userInfo) {
        const refreshed = await oauthClient.refresh();
        if (!refreshed) {
            console.log('10. Session is expired');
        }
    }

    // Test logout
    console.log('11. Running a logout on the system browser ...');
    const endSessionRequestUrl = await oauthClient.logout();
    await logout(endSessionRequestUrl);

} catch (e: any) {

    // Report errors
    console.log(e.message);
}
