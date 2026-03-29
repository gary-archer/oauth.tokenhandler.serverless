import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieProcessor} from '../http/cookieProcessor';
import {PathProcessor} from '../http/pathProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {Container} from '../utilities/container';

/*
 * A demo level class to manage HTTP forwarding of API requests
 */
export class OAuthProxy {

    private readonly container: Container;
    private readonly routes: RouteConfiguration[];
    private readonly cookieProcessor: CookieProcessor;

    public constructor(
        container: Container,
        routes: RouteConfiguration[],
        cookieConfiguration: CookieConfiguration) {

        this.container = container;
        this.routes = routes;
        this.cookieProcessor = new CookieProcessor(cookieConfiguration);
    }

    public async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        // Decrypt the access token cookie
        const accessToken = this.cookieProcessor.readAccessCookie(event);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('access token');
        }

        // Forward the access token to the target API
        const apiResponse = await this.callApi(event, accessToken);

        // Write the response to the container
        return ResponseWriter.objectResponse(apiResponse.status, apiResponse.data, apiResponse.headers);
    }

    /*
     * Call the target API with an access token
     */
    public async callApi(event: APIGatewayProxyEvent, accessToken: string): Promise<any> {

        // Get the route, which has been verified by the authorizer middleware
        const route = PathProcessor.findRoute(event, this.routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // Calculate the full target path
        const fullPath = PathProcessor.getFullPath(event);
        const fullPathToForward = fullPath.replace(route.path, '');
        const url = `${route.target}${fullPathToForward}`;

        const headers: any  = {
            'accept': 'application/json',
            'authorization': `Bearer ${accessToken}`,
        };

        // Set request options
        const options: RequestInit = {
            method: event.httpMethod,
            headers,
        };

        // Add any custom headers we have received from the client
        if (event.headers) {

            Object.keys(event.headers).forEach((name) => {
                if (name.toLowerCase().startsWith('authsamples')) {
                    headers[name] = event.headers[name] as string;
                }
            });
        }

        // Forward the correlation id from the log entry
        headers['correlation-id'] = this.container.getLogEntry().getCorrelationId();

        // Also forward the exception testing header if present
        const headerValue = event.headers['api-exception-simulation'] as string;
        if (headerValue) {
            headers['api-exception-simulation'] = headerValue;
        }

        // Supply a body to the API if required
        if (event.body) {
            headers['content-type'] = 'application/json';
            options.body = JSON.stringify(event.body);
        }

        try {

            // Make the request
            const response = await fetch(url, options);

            // Try to read either a valid response or an error response as JSON
            const data = await response.json();
            return {
                status: response.status,
                data,
            };

        } catch (e: any) {

            // If JSON handling fails or there is a connectivity problem, process the error here
            throw ErrorUtils.fromFetchError(e, url, 'web API');
        }
    }
}
