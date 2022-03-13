import {APIGatewayProxyEvent} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse, Method} from 'axios';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {Container} from '../utilities/container';
import {CookieProcessor} from '../utilities/cookieProcessor';
import {HttpProxy} from '../utilities/httpProxy';
import {PathProcessor} from '../utilities/pathProcessor';
import {ResponseWriter} from '../utilities/responseWriter';

/*
 * A demo level class to manage HTTP forwarding of API requests
 */
export class OAuthProxy {

    private readonly _container: Container;
    private readonly _configuration: CookieConfiguration;
    private readonly _routes: RouteConfiguration[];
    private readonly _httpProxy: HttpProxy;

    public constructor(
        container: Container,
        configuration: CookieConfiguration,
        routes: RouteConfiguration[],
        httpProxy: HttpProxy) {

        this._container = container;
        this._configuration = configuration;
        this._routes = routes;
        this._httpProxy = httpProxy;
    }

    public async handleRequest(event: APIGatewayProxyEvent): Promise<void> {

        const cookieProcessor = new CookieProcessor(this._configuration);

        // For data changing commands, enforce CSRF checks
        const method = event.httpMethod.toLowerCase();
        if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
            cookieProcessor.enforceCsrfChecks(event);
        }

        // Decrypt the access token cookie, and the access token will be forwarded to the target API
        const accessToken = cookieProcessor.getAccessToken(event);
        const apiResponse = await this._callApi(event, accessToken);

        // Write the response to the container
        const response = ResponseWriter.objectResponse(apiResponse.status, apiResponse.data);
        this._container.setResponse(response);
    }

    /*
     * Call the target API with an access token
     */
    public async _callApi(event: APIGatewayProxyEvent, accessToken: string): Promise<AxiosResponse> {

        // Get the route, which has been verified by the authorizer middleware
        const route = PathProcessor.findRoute(event, this._routes);
        if (!route) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // Get the full target path
        const path = PathProcessor.getFullPath(event);
        const targetUrl = `${route.target}${path}`;

        // Set request options
        const options: AxiosRequestConfig = {

            url: targetUrl,
            method: event.httpMethod as Method,
            headers: {
                authorization: `Bearer ${accessToken}`,
            } as AxiosRequestHeaders,

            httpsAgent: this._httpProxy.agent,
        };

        // Supply a body if required
        if (event.body) {
            options.data = event.body;
        }

        try {

            // Try the request, and return the response on success
            return await axios.request(options);

        } catch (e: any) {

            if (e.response && e.response.status && e.response.data) {
                return e.response;
            }

            // Otherwise rethrow the exception, eg for a connectivity error
            throw ErrorUtils.fromApiHttpRequestError(e, options.url!);
        }
    }
}
