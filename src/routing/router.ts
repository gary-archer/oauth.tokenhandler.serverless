import {APIGatewayProxyEvent} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse, Method} from 'axios';
import {ReverseProxyConfiguration} from '../configuration/reverseProxyConfiguration';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ErrorFactory} from '../errors/errorFactory';

/*
 * A basic class to manage HTTP routing
 */
export class Router {

    private readonly _configuration: ReverseProxyConfiguration;

    public constructor(configuration: ReverseProxyConfiguration) {
        this._configuration = configuration;
    }

    /*
     * Find an incoming route and return a generic error if an invalid route is requested
     */
    public findRoute(event: APIGatewayProxyEvent): RouteConfiguration {

        const found = this._configuration.routes.find(r => event.path.toLowerCase().startsWith(r.path.toLowerCase()));
        if (!found) {
            throw ErrorFactory.createClient401Error(`An invalid route was requested: ${event.path}`);
        }

        return found;
    }

    /*
     * Forward to the target API
     */
    public async forward(event: APIGatewayProxyEvent, route: RouteConfiguration): Promise<AxiosResponse> {

        // Send data and headers received by the proxy
        const targetUrl = `${route.target}${event.path}`;
        const options: AxiosRequestConfig = {
            url: targetUrl,
            method: event.httpMethod as Method,
            headers: event.headers as AxiosRequestHeaders,
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
}
