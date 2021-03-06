import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import base64url from 'base64url';
import crypto from 'crypto';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {OAuthAgentConfiguration} from '../configuration/oauthAgentConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {OAuthErrorStatus} from '../errors/oauthErrorStatus';
import {CookieProcessor} from '../http/cookieProcessor';
import {FormProcessor} from '../http/formProcessor';
import {HeaderProcessor} from '../http/headerProcessor';
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
            const statusCode = OAuthErrorStatus.fromAuthorizationResponseError(error);
            throw ErrorUtils.fromLoginResponseError(statusCode, error, errorDescription);

        } else if (!(state && code)) {

            // Handle normal page loads, such as loading a new browser tab
            const body = {
                isLoggedIn: false,
                handled: false,
            } as PageLoadResponse;

            // See if there are existing cookies
            const existingIdToken = this._cookieProcessor.readIdCookie(event);
            const existingAntiForgeryToken = this._cookieProcessor.readAntiForgeryCookie(event);
            if (existingIdToken && existingAntiForgeryToken) {

                // Update the response fields and log the user ID
                body.isLoggedIn = true;
                body.antiForgeryToken = existingAntiForgeryToken;
                this._logUserId(existingIdToken);
            }

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

            // Write the response and attach secure cookies
            const response = ResponseWriter.objectResponse(200, body);
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

        // Check incoming details
        this._validateAntiForgeryCookie(event);

        // Get the refresh token from the cookie
        const refreshToken = this._cookieProcessor.readRefreshCookie(event);
        if (!refreshToken) {
            throw ErrorUtils.fromMissingCookieError('rt');
        }

        // Get the id token from the id cookie
        const idToken = this._cookieProcessor.readIdCookie(event);
        if (!idToken) {
            throw ErrorUtils.fromMissingCookieError('id');
        }

        // Include the OAuth user id in API logs
        this._logUserId(idToken);

        // Send the request for a new access token to the Authorization Server
        const refreshTokenGrantData =
            await this._authorizationServerClient.sendRefreshTokenGrant(refreshToken);

        const newRefreshToken = refreshTokenGrantData.refresh_token;
        const newIdToken = refreshTokenGrantData.id_token;

        // Return an empty response to the browser, with attached cookies
        const response = ResponseWriter.objectResponse(204, null);
        response.multiValueHeaders = {
            'set-cookie': [
                this._cookieProcessor.writeAccessCookie(refreshTokenGrantData.access_token),
                this._cookieProcessor.writeRefreshCookie(newRefreshToken ?? refreshToken),
                this._cookieProcessor.writeIdCookie(newIdToken ?? idToken),
            ]
        };
        return response;
    }

    /*
     * Make the refresh and / or the access token inside secure cookies act expired, for testing purposes
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async expire(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        // Get whether to expire the access or refresh token
        const type = FormProcessor.readJsonField(event, 'type');
        const operation = type === 'access' ? 'expireAccessToken' : 'expireRefreshToken';
        this._container.getLogEntry().setOperationName(operation);

        // Check incoming details
        this._validateAntiForgeryCookie(event);

        // Get the current refresh token
        const accessToken = this._cookieProcessor.readAccessCookie(event);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('at');
        }

        // Get the current refresh token
        const refreshToken = this._cookieProcessor.readRefreshCookie(event);
        if (!refreshToken) {
            throw ErrorUtils.fromMissingCookieError('rt');
        }

        // Get the id token from the id cookie
        const idToken = this._cookieProcessor.readIdCookie(event);
        if (!idToken) {
            throw ErrorUtils.fromMissingCookieError('id');
        }

        // Include the OAuth user id in API logs
        this._logUserId(idToken);

        // Always make the access cookie act expired to cause an API 401
        const cookies = [
            this._cookieProcessor.writeAccessCookie(`${accessToken}x`),
        ];

        // If requested, make the refresh cookie act expired, to cause a permanent API 401
        if (type === 'refresh') {
            cookies.push(this._cookieProcessor.writeRefreshCookie(`${refreshToken}x`));
        }

        // Return the response with the expired header
        const response = ResponseWriter.objectResponse(204, null);
        response.multiValueHeaders = {
            'set-cookie': cookies
        };
        return response;
    }

    /*
     * Return the logout URL and clear cookies
     */
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async logout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this._container.getLogEntry().setOperationName('logout');

        // Check incoming details
        this._validateAntiForgeryCookie(event);

        // Get the id token from the id cookie
        const idToken = this._cookieProcessor.readIdCookie(event);
        if (!idToken) {
            throw ErrorUtils.fromMissingCookieError('id');
        }

        // Include the OAuth user id in API logs
        this._logUserId(idToken);

        // Write the full end session URL to the response body
        const body = {
            endSessionRequestUri: this._authorizationServerClient.getEndSessionRequestUri(idToken),
        };

        // Clear all cookies in the browser
        const response = ResponseWriter.objectResponse(200, body);
        response.multiValueHeaders = {
            'set-cookie': this._cookieProcessor.expireAllCookies()
        };
        return response;
    }

    /*
     * Extra cookies checks for data changing requests in line with OWASP
     */
    private _validateAntiForgeryCookie(event: APIGatewayProxyEvent): void {

        // Get the cookie value
        const cookieValue = this._cookieProcessor.readAntiForgeryCookie(event);
        if (!cookieValue) {
            throw ErrorUtils.fromMissingCookieError('csrf');
        }

        // Check the client has sent a matching anti forgery request header
        const headerName = this._cookieProcessor.getAntiForgeryRequestHeaderName();
        const headerValue = HeaderProcessor.readHeader(event, headerName);
        if (!headerValue) {
            throw ErrorUtils.fromMissingAntiForgeryTokenError();
        }

        // Check that the values match
        if (cookieValue !== headerValue) {
            throw ErrorUtils.fromMismatchedAntiForgeryTokenError();
        }
    }

    /*
     * Parse the id token then include the user id in logs
     */
    private _logUserId(idToken: string): void {

        const parts = idToken.split('.');
        if (parts.length === 3) {

            const payload = base64url.decode(parts[1]);
            if (payload) {
                const claims = JSON.parse(payload);
                if (claims.sub) {
                    this._container.getLogEntry().setUserId(claims.sub);
                }
            }
        }
    }
}
