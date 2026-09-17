import {APIGatewayProxyResult} from 'aws-lambda';
import {ErrorUtils} from '../errors/errorUtils';
import {PathProcessor} from '../http/pathProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {OAuthAgent} from '../oauth-agent/oauthAgent';
import {OAuthProxy} from '../oauth-proxy/oauthProxy';
import {APIGatewayProxyExtendedEvent} from '../utilities/apiGatewayProxyExtendedEvent';
import {LambdaInstance} from './lambdaInstance';

/*
 * A wildcard lambda through which the SPA calls the authorization server and APIs
 */
const instance = new LambdaInstance();
const baseHandler = async (event: APIGatewayProxyExtendedEvent) : Promise<APIGatewayProxyResult> => {

    // Return immediately for pre-flight requests
    if (event.httpMethod.toLowerCase() === 'options') {
        return ResponseWriter.objectResponse(204, null);
    }

    // Get configuration
    const configuration = instance.getConfiguration();
    const path = event.path.toLowerCase();

    // Handle OAuth agent requests
    if (path.startsWith('/oauth-agent')) {

        const oauthAgent = new OAuthAgent(configuration.oauthAgent, configuration.cookie);
        return await oauthAgent.handleRequest(event);
    }

    // Use the OAuth proxy to handle API requests by decrypting cookies and forwarding an access token
    const apiRoute = PathProcessor.findApiRoute(event, configuration.apiRoutes);
    if (!apiRoute) {
        throw ErrorUtils.fromInvalidRouteError();
    }

    const oauthProxy = new OAuthProxy(configuration.apiRoutes, configuration.cookie);
    return await oauthProxy.handleRequest(event);
};

// Prepare the lambda instance, which is used for multiple HTTP requests, with cross cutting concerns
const handler = instance.prepare(baseHandler);
export {handler};
