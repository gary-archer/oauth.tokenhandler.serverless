import {APIGatewayProxyEvent} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse, Method} from 'axios';
import {Configuration} from '../configuration/configuration';
import {ErrorUtils} from '../errors/errorUtils';
import {HttpProxy} from '../utilities/httpProxy';
import {PathProcessor} from '../utilities/pathProcessor';

/*
 * A class to manage HTTP routing of JSON based requests
 */
export class JsonRouter {

    private readonly _configuration: Configuration;

    public constructor(configuration: Configuration) {
        this._configuration = configuration;
    }

    /*
     * Forward to the target API
     */
    public async route(event: APIGatewayProxyEvent, accessToken: string | null): Promise<AxiosResponse> {

        // Get the route, which has been verified by the authorizer middleware
        const route = PathProcessor.findRoute(event, this._configuration.routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // When configured, use an HTTP proxy to debug outgoing requests
        const httpProxy = new HttpProxy(this._configuration.host.useProxy, this._configuration.host.proxyUrl);
        await httpProxy.initialize();

        // Get the full target path
        const path = PathProcessor.getFullPath(event);
        const targetUrl = `${route.target}${path}`;

        // Set request options to get the JSON data
        const options: AxiosRequestConfig = {
            url: targetUrl,
            method: event.httpMethod as Method,
            headers: {} as AxiosRequestHeaders,
            httpsAgent: httpProxy.agent,
        };

        // Supply a body if required
        if (event.body) {
            options.data = event.body;
        }

        // Add the access token if required
        if (accessToken) {
            options.headers!.authorization = `Bearer ${accessToken}`;
        }

        try {

            // Try the request, and return the response on success
            return await axios.request(options);

        } catch (e: any) {

            if (e.response && e.response.status && e.response.data) {
                return e.response;
            }

            // Otherwise rethrow the exception, eg for a connectivity error
            throw e;
        }
    }
}
