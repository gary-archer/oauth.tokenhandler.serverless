import {CookieJar} from 'tough-cookie';
import {OAuthError} from './oauthError.js';

/*
 * A utility to make requests to token handler endpoints in a similar way to a browser client
 */
export class OAuthClient {

    private readonly bffBaseUrl: string;
    private readonly cookieJar: CookieJar;

    public constructor(bffBaseUrl: string) {
        this.bffBaseUrl = bffBaseUrl;
        this.cookieJar = new CookieJar();
    }

    /*
     * Start a login and return the authorization request URL
     */
    public async startLogin(): Promise<string> {

        const response = await this.callOAuthAgent('POST', 'oauth-agent/login/start', null, true);
        return response.authorizationRequestUrl;
    }

    /*
     * End a login with the authorization response URL
     */
    public async endLogin(authorizationResponseUrl: string): Promise<any> {

        const body = {
            pageUrl: authorizationResponseUrl,
        };
        const response = await this.callOAuthAgent('POST', 'oauth-agent/login/end', body, true);
        return response.claims;
    }

    /*
     * Get the session
     */
    public async session(): Promise<any> {
        return await this.callOAuthAgent('GET', 'oauth-agent/session', null, true);
    }

    /*
     * Get OAuth user info or return null if the access token is expired
     */
    public async userInfo(): Promise<any> {

        try {

            return await this.callOAuthAgent('GET', 'oauthuserinfo', null, true);

        } catch (e: any) {

            if (e instanceof OAuthError && e.status === 401) {
                return null;
            }

            throw e;
        }
    }

    /*
     * Refresh tokens
     */
    public async refresh(): Promise<boolean> {
        
        try {

            await this.callOAuthAgent('POST', 'oauth-agent/refresh', null, false);
            return true;

        } catch (e: any) {

            if (e instanceof OAuthError && e.status === 401) {
                return false;
            }

            throw e;
        }
    }

    /*
     * Get the end session request URL
     */
    public async logout(): Promise<string> {

        const response = await this.callOAuthAgent('POST', 'oauth-agent/logout', null, true);
        return response.url;
    }

    /*
     * Make the access token act expired
     */
    public async expireAccessToken(): Promise<void> {
        await this.callOAuthAgent('POST', 'oauth-agent/access/expire', null, false);
    }

    /*
     * Make the refresh token act expired
     */
    public async expireRefreshToken(): Promise<void> {
        await this.callOAuthAgent('POST', 'oauth-agent/refresh/expire', null, false);
    }

    /*
     * Use fetch to call the OAuth Agent
     */
    private async callOAuthAgent(
        method: string,
        operationPath: string,
        dataToSend: any,
        readResponse: boolean): Promise<any> {

        // Set the full URL
        const url = `${this.bffBaseUrl}/${operationPath}`;

        // Get any existing cookie header
        const cookieHeader = await this.cookieJar.getCookieString(url);

        // Use the credentials option to send same-site cross-origin cookies to the token handler
        // Also add the token-handler-version custom header that the token handler requires
        const options: RequestInit = {
            method,
            credentials: 'include',
            headers: {
                'accept': 'application/json',
                'token-handler-version': '1',
                'correlation-id': crypto.randomUUID(),
            }
        };

        if (cookieHeader) {
            (options.headers as any)['cookie'] = cookieHeader;
        }

        // Send JSON data if required
        if (dataToSend) {
            (options.headers as any)['content-type'] = 'application/json';
            options.body = JSON.stringify(dataToSend);
        }

        // Try the request and handle connection errors
        let response: Response;
        try {
            response = await fetch(url, options);
        } catch (e: any) {
            throw new Error(`OAuth agent request error: ${e.message}`, e);
        }

        // Report response errors
        if (!response.ok) {

            const error = await response.json() as any;
            const code = error.code || 'general_error';
            const message = error.message || `Problem encountered calling ${url}`;
            throw new OAuthError(response.status, code, message);
        }

        // Set any updated cookie headers
        const setCookie = response.headers.getSetCookie();
        for (const cookie of setCookie) {
            await this.cookieJar.setCookie(cookie, url);
        }

        // Return response data if required
        if (readResponse) {
            return await response.json();
        }
    }
}
