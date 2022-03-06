import {APIGatewayProxyEvent} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosResponse, Method} from 'axios';
import {ReverseProxyConfiguration} from '../configuration/reverseProxyConfiguration';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ClientErrorImpl} from '../errors/clientErrorImpl';
import {ErrorCodes} from '../errors/errorCodes';

/*
 * A class to manage HTTP routing of JSON based requests
 */
export class JsonRouter {

    private readonly _configuration: ReverseProxyConfiguration;

    public constructor(configuration: ReverseProxyConfiguration) {
        this._configuration = configuration;
    }

    /*
     * Forward to the target API
     */
    public async route(event: APIGatewayProxyEvent): Promise<AxiosResponse> {

        // Try to find the route, or return a 404 if not found
        const route = this._findRoute(event);

        // Send data and headers received by the proxy
        const targetUrl = this._getFullTargetUrl(event, route);

        const options: AxiosRequestConfig = {
            url: targetUrl,
            method: event.httpMethod as Method,
            transformResponse: [],
        };

        if (event.body) {
            options.data = event.body;
        }

        try {

            // Try the request, and return the response on success
            return await axios.request(options);

        } catch (e: any) {

            if (e.response && e.response.status && e.response.data) {

                // Return the downstream error response if possible
                return e.response;
            }

            // Rethrow the exception if there is a connectivity error
            throw e;
        }
    }

    /*
     * Find an incoming route and return a generic error if an invalid route is requested
     */
    private _findRoute(event: APIGatewayProxyEvent): RouteConfiguration {

        const found = this._configuration.routes.find(r => event.path.toLowerCase().startsWith(r.path.toLowerCase()));
        if (!found) {
            const error = new ClientErrorImpl(404, ErrorCodes.invalidRoute, 'The API route requested does not exist');
            error.setLogContext(event.path);
            throw error;
        }

        return found;
    }

    /*
     * Get the request path including any query string parameters
     */
    private _getFullTargetUrl(event: APIGatewayProxyEvent, route: RouteConfiguration): string {

        // Set the base path
        let path = event.path;

        // Collect each item
        const items = [];
        for (const key in event.queryStringParameters) {
            if (key) {
                items.push(`${key}=${event.queryStringParameters[key]}`);
            }
        }

        // Append to the base path
        if (items.length > 0) {
            path += `?${items.join('&')}`;
        }

        return `${route.target}${path}`;
    }
}
