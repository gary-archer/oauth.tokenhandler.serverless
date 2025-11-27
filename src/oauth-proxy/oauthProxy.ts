import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import axios, {AxiosRequestConfig, Method} from 'axios';
import {CookieConfiguration} from '../configuration/cookieConfiguration.js';
import {RouteConfiguration} from '../configuration/routeConfiguration.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {CookieProcessor} from '../http/cookieProcessor.js';
import {PathProcessor} from '../http/pathProcessor.js';
import {ResponseWriter} from '../http/responseWriter.js';
import {Container} from '../utilities/container.js';

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
        return ResponseWriter.objectResponse(apiResponse.status, apiResponse.data);
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
        const targetUrl = `${route.target}${fullPathToForward}`;

        const headers: any = {
            authorization: `Bearer ${accessToken}`,
        };

        // Set request options
        const options: AxiosRequestConfig = {

            url: targetUrl,
            method: event.httpMethod as Method,
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

        // Ensure that the correlation id from the log entry is forwarded
        headers['authsamples-correlation-id'] = this.container.getLogEntry().getCorrelationId();

        // Supply a body if required
        if (event.body) {
            options.data = event.body;
        }

        try {

            // Try the request, and return the response on success
            const response = await axios.request(options);
            return {
                status: response.status,
                data: response.data,
            };

        } catch (e: any) {

            if (e.response && e.response.status && e.response.data) {

                return {
                    status: e.response.status,
                    data: e.response.data,
                };
            }

            // Otherwise rethrow the exception, such as connectivity errors
            throw ErrorUtils.fromApiHttpRequestError(e, options.url || '');
        }
    }

    /*
     * Add selected response headers for API requests
     */
    private getResponseHeaders(response: any): any {

        const headers: any = {};

        if (response.headers) {

            const wwwAuthenticate = response.headers['www-authenticate'];
            if (wwwAuthenticate) {
                headers['www-authenticate'] = wwwAuthenticate;
            }
        }

        return headers;
    }
}
