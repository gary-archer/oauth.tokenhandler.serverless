import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {OAuthAgentConfiguration} from '../configuration/oauthAgentConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieProcessor} from '../http/cookieProcessor';
import {FormProcessor} from '../http/formProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {Base64Url} from '../utilities/base64url';
import {Container} from '../utilities/container';
import {AuthorizationServerClient} from './authorizationServerClient';
import {EndLoginResponse} from './endLoginResponse';

/*
 * The entry point for OAuth Agent handling
 */
export class OAuthAgent {

    private readonly container: Container;
    private readonly configuration: OAuthAgentConfiguration;
    private readonly cookieProcessor: CookieProcessor;
    private readonly authorizationServerClient: AuthorizationServerClient;

    public constructor(
        container: Container,
        agentConfiguration: OAuthAgentConfiguration,
        cookieConfiguration: CookieConfiguration) {

        this.container = container;
        this.configuration = agentConfiguration;
        this.authorizationServerClient = new AuthorizationServerClient(this.configuration);
        this.cookieProcessor = new CookieProcessor(cookieConfiguration);
    }

    /*
     * The entry point for processing of OAuth requests on behalf of the SPA
     */
    public async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        const method = event.httpMethod.toLowerCase();
        const path = event.path.toLowerCase();

        if (method === 'post' && path.endsWith('/oauth-agent/login/start')) {

            return this.startLogin(event);

        } else if (method === 'post' && path.endsWith('/oauth-agent/login/end')) {

            return this.endLogin(event);

        } else if (method === 'get' && path.endsWith('/oauth-agent/session')) {

            return this.session(event);

        } else if (method === 'post' && path.endsWith('/oauth-agent/refresh')) {

            return this.refresh(event);

        } else if (method === 'post' && path.endsWith('/oauth-agent/access/expire')) {

            return this.expireAccess(event);

        } else if (method === 'post' && path.endsWith('/oauth-agent/refresh/expire')) {

            return this.expireRefresh(event);

        } else if (method === 'post' && path.endsWith('/oauth-agent/logout')) {

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

        this.container.getLogEntry().setOperationName('startLogin');

        // First create a random login state
        const loginState = this.authorizationServerClient.generateLoginState();

        // Get the full authorization URL as response data
        const body = {} as any;
        body.authorizationRequestUrl = this.authorizationServerClient.getAuthorizationRequestUrl(loginState);

        // Create a temporary state cookie
        const cookiePayload = {
            state: loginState.getState(),
            codeVerifier: loginState.getCodeVerifier(),
        };
        const cookie = this.cookieProcessor.writeStateCookie(cookiePayload);

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
    public async endLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this.container.getLogEntry().setOperationName('endLogin');

        // Process the URL posted by the SPA
        const urlString = FormProcessor.readJsonField(event, 'pageUrl');
        if (!urlString) {
            throw ErrorUtils.fromMissingJsonFieldError('pageUrl');
        }

        const url = new URL(urlString);
        if (!url) {
            const error = ErrorUtils.fromMissingJsonFieldError('pageUrl');
            error.setLogContext(url);
            throw error;
        }

        const args = new URLSearchParams(url.search);
        const code = args.get('code') || '';
        const state = args.get('state') || '';
        const error = args.get('error') || '';
        const errorDescription = args.get('error_description') || '';

        if (state && error) {

            // Report Authorization Server front channel errors back to the SPA
            throw ErrorUtils.fromLoginResponseError(400, error, errorDescription);

        } else if (!(state && code)) {

            // Handle normal page loads, such as loading a new browser tab
            const body = {
                handled: false,
                isLoggedIn: this.cookieProcessor.isLoggedIn(event),
            } as EndLoginResponse;

            return ResponseWriter.objectResponse(200, body);

        } else {

            // Start processing a login response by checking the state matches that in the cookie
            const stateCookie = this.cookieProcessor.readStateCookie(event);
            if (!stateCookie) {
                throw ErrorUtils.fromMissingCookieError('state');
            }

            if (state !== stateCookie.state) {
                throw ErrorUtils.fromInvalidStateError();
            }

            // Send the authorization code grant message to the authorization server
            const authCodeGrantData = await this.authorizationServerClient.sendAuthorizationCodeGrant(
                code,
                stateCookie.codeVerifier);

            // Get tokens and include the OAuth User ID in API logs
            const refreshToken = authCodeGrantData.refresh_token;
            const accessToken = authCodeGrantData.access_token;
            const idToken = authCodeGrantData.id_token;

            // Log ID token info
            const idTokenPayload = idToken.split('.')[1];
            const claims = JSON.parse(Base64Url.decode(idTokenPayload).toString());
            this.container.getLogEntry().setIdTokenInfo(claims.sub, claims.origin_jti);

            // Inform the SPA that that a login response was handled
            const body = {
                handled: true,
                isLoggedIn: true,
                claims,
            } as EndLoginResponse;

            // Write the response and attach secure cookies
            const response = ResponseWriter.objectResponse(200, body);
            response.multiValueHeaders = {
                'set-cookie': [
                    this.cookieProcessor.expireStateCookie(),
                    this.cookieProcessor.writeRefreshCookie(refreshToken),
                    this.cookieProcessor.writeAccessCookie(accessToken),
                    this.cookieProcessor.writeIdCookie(idToken),
                ]
            };
            return response;
        }
    }

    /*
     * Return session information to the SPA
     */
    public async session(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        const claims = this.preProcessRequest('session', event);
        const body: any = {
            handled: false,
            isLoggedIn: !!claims,
        };

        if (claims) {
            body.claims = claims;
        }

        return ResponseWriter.objectResponse(200, body);
    }

    /*
     * Write a new access token into the access token cookie
     */
    public async refresh(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this.preProcessRequest('refresh', event);

        // Get the refresh token from the cookie
        const refreshToken = this.cookieProcessor.readRefreshCookie(event);
        if (!refreshToken) {
            throw ErrorUtils.fromMissingCookieError('rt');
        }

        // Send the request for a new access token to the authorization server
        const refreshTokenGrantData =
            await this.authorizationServerClient.sendRefreshTokenGrant(refreshToken);

        const newRefreshToken = refreshTokenGrantData.refresh_token;
        const newIdToken = refreshTokenGrantData.id_token;

        const cookies = [
            this.cookieProcessor.writeAccessCookie(refreshTokenGrantData.access_token),
            this.cookieProcessor.writeRefreshCookie(newRefreshToken ?? refreshToken),
        ];

        if (newIdToken) {
            cookies.push(this.cookieProcessor.writeIdCookie(newIdToken));
        }

        // Return an empty response to the browser, with attached cookies
        const response = ResponseWriter.objectResponse(204, null);
        response.multiValueHeaders = {
            'set-cookie': cookies,
        };
        return response;
    }

    /*
     * Make the access token inside secure cookies act expired, for testing purposes
     */
    public async expireAccess(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this.preProcessRequest('expireAccessToken', event);

        // Get the current access token
        const accessToken = this.cookieProcessor.readAccessCookie(event);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('at');
        }

        // Make the access cookie act expired to cause an API 401
        const cookies = [
            this.cookieProcessor.writeAccessCookie(`${accessToken}x`),
        ];

        // Return the response with the expired header
        const response = ResponseWriter.objectResponse(204, null);
        response.multiValueHeaders = {
            'set-cookie': cookies
        };
        return response;
    }

    /*
     * Make the refresh token inside secure cookies act expired, for testing purposes
     */
    public async expireRefresh(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this.preProcessRequest('expireRefreshToken', event);

        // Get the current access token
        const accessToken = this.cookieProcessor.readAccessCookie(event);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('at');
        }

        // Get the current refresh token
        const refreshToken = this.cookieProcessor.readRefreshCookie(event);
        if (!refreshToken) {
            throw ErrorUtils.fromMissingCookieError('rt');
        }

        // Always make the access cookie act expired to cause an API 401
        const cookies = [
            this.cookieProcessor.writeAccessCookie(`${accessToken}x`),
            this.cookieProcessor.writeRefreshCookie(`${refreshToken}x`),
        ];

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
    public async logout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        this.preProcessRequest('logout', event);

        // Write the full end session URL to the response body
        const body = {
            url: this.authorizationServerClient.getEndSessionRequestUrl(),
        };

        // Clear all cookies in the browser
        const response = ResponseWriter.objectResponse(200, body);
        response.multiValueHeaders = {
            'set-cookie': this.cookieProcessor.expireAllCookies()
        };
        return response;
    }

    /*
     * Pre process the request to perform logging and return the ID token
     */
    private preProcessRequest(operationName: string, event: APIGatewayProxyEvent): any {

        this.container.getLogEntry().setOperationName(operationName);

        const idTokenPayload = this.cookieProcessor.readIdCookie(event);
        if (idTokenPayload) {

            const claims = JSON.parse(Base64Url.decode(idTokenPayload).toString());
            this.container.getLogEntry().setIdTokenInfo(claims.sub, claims.origin_jti);
            return claims;
        }

        return '';
    }
}
