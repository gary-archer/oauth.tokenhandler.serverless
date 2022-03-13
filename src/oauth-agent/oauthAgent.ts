import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import base64url from 'base64url';
import crypto from 'crypto';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {OAuthAgentConfiguration} from '../configuration/oauthAgentConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieProcessor} from '../http/cookieProcessor';
import {FormProcessor} from '../http/formProcessor';
import {QueryProcessor} from '../http/queryProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {Container} from '../utilities/container';
import {HttpProxy} from '../utilities/httpProxy';
import {AuthorizationServerClient} from './authorizationServerClient';
import {PageLoadResponse} from './pageLoadResponse';

/*
 * The entry point for OAuth Agent handling
 */
export class OAuthAgent {

    private readonly _container: Container;
    private readonly _configuration: OAuthAgentConfiguration;
    private readonly _httpProxy: HttpProxy;
    private readonly _cookieProcessor: CookieProcessor;
    private readonly _authorizationServerClient: AuthorizationServerClient;

    public constructor(
        container: Container,
        agentConfiguration: OAuthAgentConfiguration,
        cookieConfiguration: CookieConfiguration,
        httpProxy: HttpProxy) {

        this._container = container;
        this._configuration = agentConfiguration;
        this._httpProxy = httpProxy;

        this._authorizationServerClient = new AuthorizationServerClient(this._configuration, this._httpProxy);
        this._cookieProcessor = new CookieProcessor(cookieConfiguration);
    }

    /*
     * The entry point for processing of OAuth requests on behalf of the SPA
     */
    public async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        const method = event.httpMethod.toLowerCase();
        const path = event.path.toLowerCase();

        if (method === 'post' && path === '/oauth-agent/login/start') {

            return this.startLogin(event);

        } else if (method === 'post' && path === '/oauth-agent/login/end') {

            return this.endLogin(event);

        } else if (method === 'post' && path === '/oauth-agent/refresh') {

            return this.refresh(event);

        } else if (method === 'post' && path === '/oauth-agent/expire') {

            return this.expire(event);

        } else if (method === 'post' && path === '/oauth-agent/logout') {

            return this.logout(event);

        } else {

            // Each route should either do OAuth or API work
            throw ErrorUtils.fromInvalidRouteError();
        }
    }

    /*
     * Calculate the authorization redirect URL and write a state cookie
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async startLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this._container.getLogEntry().setOperationName('startLogin');

        // First create a random login state
        const loginState = this._authorizationServerClient.generateLoginState();

        // Get the full authorization URL as response data
        const body = {} as any;
        body.authorizationRequestUri = this._authorizationServerClient.getAuthorizationRequestUri(loginState);

        // Create a temporary state cookie
        const cookiePayload = {
            state: loginState.state,
            codeVerifier: loginState.codeVerifier,
        };
        const cookie = this._cookieProcessor.writeStateCookie(cookiePayload);

        // Return data in the AWS format
        const response = ResponseWriter.objectResponse(200, body);
        response.multiValueHeaders = {
            'set-cookie': [cookie]
        };
        return response;
    }

    /*
     * The SPA sends us the full URL when the page loads, and it may contain an authorization result
     * Complete login if required, by swapping the authorization code for tokens and storing tokens in secure cookies
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async endLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this._container.getLogEntry().setOperationName('endLogin');

        // Get the URL posted by the SPA
        const url = FormProcessor.readJsonField(event, 'url');
        if (!url) {
            throw ErrorUtils.fromMissingJsonFieldError('url');
        }

        // Get data sent up from the SPA
        const query = QueryProcessor.getQueryParameters(url);
        const code = query['code'];
        const state = query['state'];
        const error = query['error'];
        const errorDescription = query['error_description'];

        if (state && error) {

            // Report Authorization Server front channel errors back to the SPA
            throw ErrorUtils.fromLoginResponseError(error, errorDescription);

        } else if (!(state && code)) {

            // Handle normal page loads, such as loading a new browser tab
            const body = {
                isLoggedIn: false,
                handled: false,
            } as PageLoadResponse;

            // Update the logged in state
            const existingIdToken = this._cookieProcessor.readIdCookie(event);
            const existingAntiForgeryToken = this._cookieProcessor.readAntiForgeryCookie(event);
            if (existingIdToken && existingAntiForgeryToken) {

                body.isLoggedIn = true;
                body.antiForgeryToken = existingAntiForgeryToken;
            }

            // Include the OAuth User ID in API logs, then return the response
            this._logUserId(existingIdToken!);
            return ResponseWriter.objectResponse(200, body);

        } else {

            // Start processing a login response by checking the state matches that in the cookie
            const stateCookie = this._cookieProcessor.readStateCookie(event);
            if (!stateCookie) {
                throw ErrorUtils.fromMissingCookieError('state');
            }

            if (state !== stateCookie.state) {
                throw ErrorUtils.fromInvalidStateError();
            }

            // Send the Authorization Code Grant message to the Authorization Server
            const authCodeGrantData = await this._authorizationServerClient.sendAuthorizationCodeGrant(
                code,
                stateCookie.codeVerifier);

            // Get tokens and include the OAuth User ID in API logs
            const refreshToken = authCodeGrantData.refresh_token;
            const accessToken = authCodeGrantData.access_token;
            const idToken = authCodeGrantData.id_token;
            this._logUserId(idToken);

            // Inform the SPA that that a login response was handled, and generate a new anti forgery token
            const body = {
                isLoggedIn: true,
                handled: true,
                antiForgeryToken: crypto.randomBytes(32).toString('base64'),
            } as PageLoadResponse;
            const response = ResponseWriter.objectResponse(200, body);

            // Write secure cookies to the response
            response.multiValueHeaders = {
                'set-cookie': [
                    this._cookieProcessor.expireStateCookie(),
                    this._cookieProcessor.writeRefreshCookie(refreshToken),
                    this._cookieProcessor.writeAccessCookie(accessToken),
                    this._cookieProcessor.writeIdCookie(idToken),
                    this._cookieProcessor.writeAntiForgeryCookie(body.antiForgeryToken!)
                ]
            };
            return response;
        }
    }

    /*
     * Write a new access token into the access token cookie
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async refresh(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this._container.getLogEntry().setOperationName('refresh');

        /*
        // Check incoming details
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
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async expire(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this._container.getLogEntry().setOperationName('expire');

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
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async logout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this._container.getLogEntry().setOperationName('logout');

        /*
        // Check incoming details
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
     * Parse the id token then include the user id in logs
     */
    private _logUserId(idToken: string): void {

        const parts = idToken.split('.');
        if (parts.length === 3) {

            const payload = base64url.decode(parts[1]) as any;
            this._container.getLogEntry().setUserId(payload.sub);
        }
    }
}
