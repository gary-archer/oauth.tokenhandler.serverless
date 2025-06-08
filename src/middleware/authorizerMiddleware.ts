import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {OAuthAgent} from '../oauth-agent/oauthAgent.js';
import {OAuthProxy} from '../oauth-proxy/oauthProxy.js';
import {Configuration} from '../configuration/configuration.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {HeaderProcessor} from '../http/headerProcessor.js';
import {PathProcessor} from '../http/pathProcessor.js';
import {Container} from '../utilities/container.js';

/*
 * The entry point for authorization
 */
export class AuthorizerMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    private readonly container: Container;
    private readonly configuration: Configuration;

    public constructor(container: Container) {
        this.container = container;
        this.configuration = container.getConfiguration();
        this.setupCallbacks();
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

        // Always enforce the required custom header
        this.verifyCustomHeader(request.event);

        // Try to find the route, or return a 404 if not found
        const route = PathProcessor.findRoute(request.event, this.configuration.routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // When an OAuth agent is configured for an API route, use it to process OAuth requests
        const oauthAgentPlugin = route.plugins.find((p) => p === 'oauthAgent');
        if (oauthAgentPlugin) {

            const oauthAgent = new OAuthAgent(
                this.container,
                this.configuration.oauthAgent,
                this.configuration.cookie);

            const response = await oauthAgent.handleRequest(request.event);
            this.container.setResponse(response);

        }

        // When an OAuth proxy is configured for an API route, decrypt secure cookies and forward access tokens
        const oauthProxyPlugin = route.plugins.find((p) => p === 'oauthProxy');
        if (oauthProxyPlugin) {

            const oauthProxy = new OAuthProxy(
                this.container,
                this.configuration.routes,
                this.configuration.cookie);

            const response = await oauthProxy.handleRequest(request.event);
            this.container.setResponse(response);
        }

        // Each route should either do OAuth or API work
        if (!oauthAgentPlugin && !oauthProxyPlugin) {
            throw ErrorUtils.fromInvalidRouteError();
        }
    }

    /*
     * Ensure that all requests contain the header that triggers CORS preflights
     */
    private verifyCustomHeader(event: APIGatewayProxyEvent) {

        const headerValue = HeaderProcessor.readHeader(event, 'token-handler-version');
        if (headerValue != '1') {
            throw ErrorUtils.fromMissingCustomHeaderError();
        }
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private setupCallbacks(): void {
        this.before = this.before.bind(this);
    }
}
