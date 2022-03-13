import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {OAuthAgentConfiguration} from '../configuration/oauthAgentConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {Container} from '../utilities/container';
import {HttpProxy} from '../utilities/httpProxy';
import {QueryProcessor} from '../utilities/queryProcessor';
import {AuthorizationServerClient} from './authorizationServerClient';

/*
 * The entry point for OAuth Agent handling
 */
export class OAuthAgent {

    private readonly _container: Container;
    private readonly _configuration: OAuthAgentConfiguration;
    private readonly _httpProxy: HttpProxy;

    public constructor(container: Container, configuration: OAuthAgentConfiguration, httpProxy: HttpProxy) {
        this._container = container;
        this._configuration = configuration;
        this._httpProxy = httpProxy;
    }

    /*
     * The entry point for processing of OAuth requests on behalf of the SPA
     */
    public async handleRequest(request: APIGatewayProxyEvent): Promise<void> {

        const method = request.httpMethod.toLowerCase();
        const path = request.path.toLowerCase();
        let response: APIGatewayProxyResult | null = null;

        if (method === 'post' && path === '/oauth-agent/login/start') {

            response = await this.startLogin(request);

        } else if (method === 'post' && path === '/oauth-agent/login/end') {

            response = await this.endLogin(request);

        } else if (method === 'post' && path === '/oauth-agent/refresh') {

            response = await this.refresh(request);

        } else if (method === 'post' && path === '/oauth-agent/expire') {

            response = await this.expire(request);

        } else if (method === 'post' && path === '/oauth-agent/logout') {

            response = await this.logout(request);

        } else {

            // Each route should either do OAuth or API work
            throw ErrorUtils.fromInvalidRouteError();
        }

        // Write the response to the container
        this._container.setResponse(response);
    }

    /*
     * Calculate the authorization redirect URL and write a state cookie
     */
    public async startLogin(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        // Check incoming details
        // request.getLogEntry().setOperationName('startLogin');

        // First create a random login state
        const authorizationServerClient = new AuthorizationServerClient(this._configuration, this._httpProxy);
        const loginState = authorizationServerClient.generateLoginState();

        // Get the full authorization URL and write it to the response body
        const data = {} as any;
        data.authorizationRequestUri = authorizationServerClient.getAuthorizationRequestUri(loginState);

        const response: APIGatewayProxyResult = {
            statusCode: 200,
            body: data,
        };

        // Also write a temporary state cookie
        const cookieData = {
            state: loginState.state,
            codeVerifier: loginState.codeVerifier,
        };
        // this._cookieService.writeStateCookie(cookieData, response);
        return response;

    }

    /*
     * The SPA sends us the full URL when the page loads, and it may contain an authorization result
     * Complete login if required, by swapping the authorization code for tokens and storing tokens in secure cookies
     */
    public async endLogin(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        /*
        // First do basic validation
        // request.getLogEntry().setOperationName('endLogin');

        // Get the URL posted by the SPA
        const url = request.getJsonField('url');
        if (!url) {
            throw ErrorUtils.fromFormFieldNotFoundError('url');
        }

        // Get data from the SPA
        const query = QueryProcessor.getQueryParameters(url);
        const code = query['code'];
        const state = query['state'];
        const error = query['error'];
        const errorDescription = query['error_description'];

        // Handle normal page loads, which can occur frequently during a user session
        if (!(state && code) && !(state && error)) {
            this._handlePageLoad(request, response);
            return;
        }

        // Report Authorization Server errors back to the SPA, such as those sending an invalid scope
        if (state && error) {
            throw ErrorUtils.fromLoginResponseError(error, errorDescription);
        }

        // Read the state cookie and then clear it
        const stateCookie = this._cookieService.readStateCookie(request);
        if (!stateCookie) {
            throw ErrorUtils.fromMissingCookieError('state');
        }
        this._cookieService.clearStateCookie(response);

        // Check that the value posted matches that in the cookie
        if (state !== stateCookie.state) {
            throw ErrorUtils.fromInvalidStateError();
        }

        // Send the Authorization Code Grant message to the Authorization Server
        const authCodeGrantData = await this._oauthService.sendAuthorizationCodeGrant(code, stateCookie.codeVerifier);

        const refreshToken = authCodeGrantData.refresh_token;
        if (!refreshToken) {
            throw ErrorUtils.createGenericError(
                'No refresh token was received in an authorization code grant response');
        }

        const accessToken = authCodeGrantData.access_token;
        if (!accessToken) {
            throw ErrorUtils.createGenericError(
                'No access token was received in an authorization code grant response');
        }

        // We do not validate the id token since it is received in a direct HTTPS request
        const idToken = authCodeGrantData.id_token;
        if (!idToken) {
            throw ErrorUtils.createGenericError(
                'No id token was received in an authorization code grant response');
        }

        // Include the OAuth User ID in API logs
        this._logUserId(request, idToken);

        // Write tokens to separate HTTP only encrypted same site cookies
        this._cookieService.writeRefreshCookie(refreshToken, response);
        this._cookieService.writeAccessCookie(accessToken, response);
        this._cookieService.writeIdCookie(idToken, response);

        // Inform the SPA that that a login response was handled
        const endLoginData = {
            isLoggedIn: true,
            handled: true,
        } as any;

        // Create an anti forgery cookie which will last for the duration of the multi tab browsing session
        this._createAntiForgeryResponseData(request, response, endLoginData);
        response.setBody(endLoginData);
        */

        return {
            statusCode: 200,
            body: '',
        };
    }

    /*
     * Write a new access token into the access token cookie
     */
    public async refresh(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        /*
        // Check incoming details
        request.getLogEntry().setOperationName('refresh');
        this._validateAntiForgeryCookie(request);

        // Get the refresh token from the cookie
        const refreshToken = this._cookieService.readRefreshCookie(request);
        if (!refreshToken) {
            throw ErrorUtils.fromMissingCookieError('rt');
        }

        // Get the id token from the id cookie
        const idToken = this._cookieService.readIdCookie(request);
        if (!idToken) {
            throw ErrorUtils.fromMissingCookieError('id');
        }

        // Include the OAuth user id in API logs
        this._logUserId(request, idToken);

        // Send the request for a new access token to the Authorization Server
        const refreshTokenGrantData =
            await this._oauthService.sendRefreshTokenGrant(refreshToken);

        // Rewrite cookies
        const newRefreshToken = refreshTokenGrantData.refresh_token;
        const newIdToken = refreshTokenGrantData.id_token;
        this._cookieService.writeAccessCookie(refreshTokenGrantData.access_token, response);
        this._cookieService.writeRefreshCookie(newRefreshToken ?? refreshToken, response);
        this._cookieService.writeIdCookie(newIdToken ?? idToken, response);

        // Return an empty response to the browser
        response.setStatusCode(204);
        */

        return {
            statusCode: 200,
            body: '',
        };
    }

    /*
     * Make the refresh and / or the access token inside secure cookies act expired, for testing purposes
     */
    public async expire(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        /*
        // Get whether to expire the access or refresh token
        const type = request.getJsonField('type');
        const operation = type === 'access' ? 'expireAccessToken' : 'expireRefreshToken';

        // Check incoming details
        request.getLogEntry().setOperationName(operation);
        this._validateAntiForgeryCookie(request);

        // Get the current refresh token
        const accessToken = this._cookieService.readAccessCookie(request);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('at');
        }

        // Get the current refresh token
        const refreshToken = this._cookieService.readRefreshCookie(request);
        if (!refreshToken) {
            throw ErrorUtils.fromMissingCookieError('rt');
        }

        // Get the id token from the id cookie
        const idToken = this._cookieService.readIdCookie(request);
        if (!idToken) {
            throw ErrorUtils.fromMissingCookieError('id');
        }

        // Include the OAuth user id in API logs
        this._logUserId(request, idToken);

        // Always make the access cookie act expired to cause an API 401
        const expiredAccessToken = `${accessToken}x`;
        this._cookieService.writeAccessCookie(expiredAccessToken, response);

        // If requested, make the refresh cookie act expired, to cause a permanent API 401
        if (type === 'refresh') {
            const expiredRefreshToken = `${refreshToken}x`;
            this._cookieService.writeRefreshCookie(expiredRefreshToken, response);
        }

        response.setStatusCode(204);
        */

        return {
            statusCode: 200,
            body: '',
        };
    }

    /*
     * Return the logout URL and clear cookies
     */
    public async logout(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        /*
        // Check incoming details
        request.getLogEntry().setOperationName('logout');
        this._validateAntiForgeryCookie(request);

        // Get the id token from the id cookie
        const idToken = this._cookieService.readIdCookie(request);
        if (!idToken) {
            throw ErrorUtils.fromMissingCookieError('id');
        }

        // Include the OAuth user id in API logs
        this._logUserId(request, idToken);

        // Clear all cookies for the caller
        this._cookieService.clearAll(response);

        // Write the full end session URL to the response body
        const data = {} as any;
        data.endSessionRequestUri = this._oauthService.getEndSessionRequestUri(idToken);
        response.setBody(data);
        response.setStatusCode(200);
        */

        return {
            statusCode: 200,
            body: '',
        };
    }

    /*
     * Give the SPA the data it needs when it loads or the page is refreshed or a new browser tab is opened
     */
    /*private _handlePageLoad(request: APIGatewayProxyEvent): APIGatewayProxyResult {

        // Inform the SPA that this is a normal page load and not a login response
        const pageLoadData = {
            handled: false,
        } as any;

        const existingIdToken = this._cookieService.readIdCookie(request);
        const antiForgeryToken = this._cookieService.readAntiForgeryCookie(request);
        if (existingIdToken && antiForgeryToken) {

            // Return data for the case where the user is already logged in
            pageLoadData.isLoggedIn = true;
            pageLoadData.antiForgeryToken = antiForgeryToken;
            this._logUserId(request, existingIdToken);

        } else {

            // Return data for the case where the user is not logged in
            pageLoadData.isLoggedIn = false;
        }

        response.setBody(pageLoadData);
    }*/

    /*
     * Add anti forgery details to the response after signing in
     */
    /*private _createAntiForgeryResponseData(request: APIGatewayProxyEvent, data: any): void {

        // Get a random value
        const newCookieValue = this._cookieService.generateAntiForgeryValue();

        // Set an anti forgery HTTP Only encrypted cookie
        this._cookieService.writeAntiForgeryCookie(response, newCookieValue);

        // Also give the UI the anti forgery token in the response body
        data.antiForgeryToken = newCookieValue;
    }*/

    /*
     * Parse the id token then include the user id in logs
     */
    /*private _logUserId(request: APIGatewayProxyEvent, idToken: string): void {

        const decoded = decode(idToken, {complete: true});
        if (decoded && decoded.payload.sub) {
            request.getLogEntry().setUserId(decoded.payload.sub as string);
        }
    }*/
}
