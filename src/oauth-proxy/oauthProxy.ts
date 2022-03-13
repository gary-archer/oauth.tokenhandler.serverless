import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import axios, {AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse, Method} from 'axios';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {RouteConfiguration} from '../configuration/routeConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieProcessor} from '../http/cookieProcessor';
import {PathProcessor} from '../http/pathProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {HttpProxy} from '../utilities/httpProxy';

/*
 * A demo level class to manage HTTP forwarding of API requests
 */
export class OAuthProxy {

    private readonly _routes: RouteConfiguration[];
    private readonly _cookieProcessor: CookieProcessor;
    private readonly _httpProxy: HttpProxy;

    public constructor(
        routes: RouteConfiguration[],
        cookieConfiguration: CookieConfiguration,
        httpProxy: HttpProxy) {

        this._routes = routes;
        this._httpProxy = httpProxy;
        this._cookieProcessor = new CookieProcessor(cookieConfiguration);
    }

    public async handleRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

        // For data changing commands, enforce CSRF checks
        const method = event.httpMethod.toLowerCase();
        if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
            this._cookieProcessor.enforceAntiForgeryChecks(event);
        }

        // Decrypt the access token cookie
        const accessToken = this._cookieProcessor.readAccessCookie(event);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('access token');
        }

        // Forward the access token to the target API
        const apiResponse = await this._callApi(event, accessToken);

        // Write the response to the container
        return ResponseWriter.objectResponse(apiResponse.status, apiResponse.data);
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
