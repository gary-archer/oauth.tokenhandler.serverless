import {APIGatewayProxyEvent} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosResponse, Method} from 'axios';
import {Configuration} from '../configuration/configuration';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ClientErrorImpl} from '../errors/clientErrorImpl';
import {ErrorCodes} from '../errors/errorCodes';
import {PathHelper} from '../utilities/pathHelper';

/*
 * A class to manage HTTP routing of JSON based requests
 */
export class JsonRouter {

    private readonly _configuration: Configuration;

    public constructor(configuration: Configuration) {
        this._configuration = configuration;
    }

    /*
     * Find an incoming route and return a generic error if an invalid route is requested
     */
    public findRoute(event: APIGatewayProxyEvent): RouteConfiguration {

        const found = this._configuration.routes.find(r => event.path.toLowerCase().startsWith(r.path.toLowerCase()));
        if (!found) {
            const error = new ClientErrorImpl(404, ErrorCodes.invalidRoute, 'The API route requested does not exist');
            error.setLogContext(event.path);
            throw error;
        }

        return found;
    }

    /*
     * Forward to the target API
     */
    public async route(event: APIGatewayProxyEvent): Promise<AxiosResponse> {

        // Try to find the route, or return a 404 if not found
        const route = this.findRoute(event);

        // Send data and headers received by the proxy
        const path = PathHelper.getFullPath(event);
        const targetUrl = `${route.target}${path}`;

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

                // Return the downstream error response if received
                return e.response;
            }

            // Otherwise rethrow the exception, eg for a connectivity error
            throw e;
        }
    }
}
