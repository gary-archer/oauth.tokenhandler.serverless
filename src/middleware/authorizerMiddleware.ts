import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {OAuthAgent} from '../oauth-agent/oauthAgent';
import {OAuthProxy} from '../oauth-proxy/oauthProxy';
import {Configuration} from '../configuration/configuration';
import {ErrorUtils} from '../errors/errorUtils';
import {Container} from '../utilities/container';
import {HeaderProcessor} from '../utilities/headerProcessor';
import {HttpProxy} from '../utilities/httpProxy';
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
    public async before(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): Promise<void> {

        // All OPTIONS responses return 204 so avoid throwing errors
        const method = request.event.httpMethod.toLowerCase();
        if (method === 'options') {
            return;
        }

        // Create the HTTP proxy object for viewing requests in flight
        const httpProxy = new HttpProxy(this._configuration.host.useProxy, this._configuration.host.proxyUrl);
        await httpProxy.initialize();

        // Try to find the route, or return a 404 if not found
        const route = PathProcessor.findRoute(request.event, this._configuration.routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // Always enforce the web origin
        this._verifyWebOrigin(request.event);

        // When an OAuth agent is configured for an API route, use it to process OAuth requests
        const oauthAgentPlugin = route.plugins.find((p) => p === 'oauthAgent');
        if (oauthAgentPlugin) {

            const oauthAgent = new OAuthAgent(
                this._container,
                this._configuration.oauthAgent,
                httpProxy);
            await oauthAgent.handleRequest(request.event);
        }

        // When an OAuth proxy is configured for an API route, decrypt secure cookies and forward access tokens
        const oauthProxyPlugin = route.plugins.find((p) => p === 'oauthProxy');
        if (oauthProxyPlugin) {

            const oauthProxy = new OAuthProxy(
                this._container,
                this._configuration.cookie,
                this._configuration.routes,
                httpProxy);
            await oauthProxy.handleRequest(request.event);
        }

        // Each route should either do OAuth or API work
        if (!oauthAgentPlugin && !oauthProxyPlugin) {
            throw ErrorUtils.fromInvalidRouteError();
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

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.before = this.before.bind(this);
    }
}
