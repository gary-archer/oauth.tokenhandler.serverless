import {APIGatewayProxyEvent} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosResponse, Method} from 'axios';
import {ClientErrorImpl} from '../../plumbing/errors/clientErrorImpl';
import {ErrorCodes} from '../../plumbing/errors/errorCodes';
import {PathHelper} from '../../plumbing/utilities/pathHelper';
import {Configuration} from '../configuration/configuration';

/*
 * A class to manage HTTP routing of JSON based requests
 */
export class ApiClient {

    private readonly _configuration: Configuration;

    public constructor(configuration: Configuration) {
        this._configuration = configuration;
    }

    /*
     * Forward to the target API
     */
    public async route(event: APIGatewayProxyEvent): Promise<AxiosResponse> {

        // Try to find the route, or return a 404 if not found
        const route = PathHelper.findRoute(event, this._configuration.routes);
        if (!route) {
            const error = new ClientErrorImpl(404, ErrorCodes.invalidRoute, 'The API route requested does not exist');
            error.setLogContext(event.path);
            throw error;
        }

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
