import {CookieJar} from 'tough-cookie';

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
     * Get OAuth user info
     */
    public async userInfo(): Promise<any> {
        return await this.callOAuthAgent('GET', 'oauthuserinfo', null, true);
    }

    /*
     * Refresh tokens
     */
    public async refresh(): Promise<void> {
        await this.callOAuthAgent('POST', 'oauth-agent/refresh', null, false);
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

        // Add the token-handler-version custom header, which ensures CORS preflights
        const headers: HeadersInit = {
            'accept': 'application/json',
            'token-handler-version': '1',
            'correlation-id': crypto.randomUUID(),
        };

        if (cookieHeader) {
            headers['cookie'] = cookieHeader;
        }

        // Use the credentials option to send same-site cross-origin cookies to the token handler
        const options: RequestInit = {
            method,
            credentials: 'include',
            headers,
        };

        // Send JSON data if required
        if (dataToSend) {
            headers['content-type'] = 'application/json';
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

            const error = await response.json();
            const code = error.code || 'general_error';
            const message = error.message || `Problem encountered calling ${url}`;
            throw new Error(`Status: ${response.status}, Code: ${code}, Message: ${message}`);
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
