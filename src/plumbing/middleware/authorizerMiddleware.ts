import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieProcessor} from '../utilities/cookieProcessor';
import {HeaderProcessor} from '../utilities/headerProcessor';
import {PathProcessor} from '../utilities/pathProcessor';
import {RequestContainer} from '../utilities/requestContainer';

/*
 * The entry point for authorization
 */
export class AuthorizerMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    private readonly _container: RequestContainer;
    private readonly _routes: RouteConfiguration[];

    public constructor(container: RequestContainer, routes: RouteConfiguration[]) {
        this._container = container;
        this._routes = routes;
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
        const route = PathProcessor.findRoute(request.event, this._routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // When CORS is enabled we only allow requests from trusted origins
        if (route.cors) {

            const origin = HeaderProcessor.readHeader('origin', request.event);
            if (!origin) {
                throw ErrorUtils.fromMissingOriginError();
            }

            const trusted = route.cors.trustedWebOrigins.find(o => o === origin);
            if (!trusted) {
                throw ErrorUtils.fromUntrustedOriginError();
            }
        }

        // When an OAuth proxy is configured for an API route, we decrypt secure cookies and forward access tokens
        if (route.oauthProxy) {

            const cookieProcessor = new CookieProcessor(route.oauthProxy);

            // For data changing commands, enforce CSRF checks
            if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
                cookieProcessor.enforceCsrfChecks(request.event);
            }

            // Get the access token cookie and store it in the request
            const accessToken = cookieProcessor.getAccessToken(request.event);
            this._container.setAccessToken(accessToken);
        }
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.before = this.before.bind(this);
    }
}
