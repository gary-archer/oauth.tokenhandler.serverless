import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {Configuration} from '../configuration/configuration';
import {ErrorUtils} from '../errors/errorUtils';
import {Container} from '../utilities/container';
import {CookieProcessor} from '../utilities/cookieProcessor';
import {HeaderProcessor} from '../utilities/headerProcessor';
import {PathProcessor} from '../utilities/pathProcessor';

/*
 * The entry point for authorization
 */
export class AuthorizerMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    private readonly _container: Container;
    private readonly _configuration: Configuration;

    public constructor(container: Container, configuration: Configuration) {
        this._container = container;
        this._configuration = configuration;
        this._setupCallbacks();
    }

    /*
     * Authorize requests depending on how the route is configured and whether a pre-flight request
     */
    public before(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {

        // All OPTIONS responses return 204 so avoid throwing errors
        const method = request.event.httpMethod.toLowerCase();
        if (method === 'options') {
            return;
        }

        // Try to find the route, or return a 404 if not found
        const route = PathProcessor.findRoute(request.event, this._configuration.routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // Always enforce the web origin
        this._verifyWebOrigin(request.event);

        // When an OAuth proxy is configured for an API route, decrypt secure cookies and forward access tokens
        const oauthProxy = route.plugins.find((p) => p === 'oauthProxy');
        if (oauthProxy) {
            this._authorizeOAuthProxy(method, request.event);
        }
    }

    /*
     * Ensure that we are called from a trusted web origin
     */
    private _verifyWebOrigin(event: APIGatewayProxyEvent) {

        const origin = HeaderProcessor.readHeader('origin', event);
        if (!origin) {
            throw ErrorUtils.fromMissingOriginError();
        }

        const trusted = this._configuration.cors.trustedWebOrigins.find(o => o === origin);
        if (!trusted) {
            throw ErrorUtils.fromUntrustedOriginError();
        }
    }

    private _authorizeOAuthProxy(method: string, event: APIGatewayProxyEvent) {

        // For data changing commands, enforce CSRF checks
        const cookieProcessor = new CookieProcessor(this._configuration.cookie);
        if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
            cookieProcessor.enforceCsrfChecks(event);
        }

        // Decrypt the access token cookie, and the access token will be forwarded to the target API
        const accessToken = cookieProcessor.getAccessToken(event);
        this._container.setAccessToken(accessToken);
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.before = this.before.bind(this);
    }
}
