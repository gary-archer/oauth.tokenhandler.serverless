import {APIGatewayProxyResult} from 'aws-lambda';
import {ApiRouteConfiguration} from '../configuration/apiRouteConfiguration';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieProcessor} from '../http/cookieProcessor';
import {PathProcessor} from '../http/pathProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {APIGatewayProxyExtendedEvent} from '../utilities/apiGatewayProxyExtendedEvent';

/*
 * Manage HTTP forwarding of API requests with a JWT access token
 */
export class OAuthProxy {

    private readonly apiRoutes: ApiRouteConfiguration[];
    private readonly cookieProcessor: CookieProcessor;

    public constructor(
        apiRoutes: ApiRouteConfiguration[],
        cookieConfiguration: CookieConfiguration) {

        this.apiRoutes = apiRoutes;
        this.cookieProcessor = new CookieProcessor(cookieConfiguration);
    }

    public async handleRequest(event: APIGatewayProxyExtendedEvent): Promise<APIGatewayProxyResult> {

        // Decrypt the access token cookie
        const accessToken = this.cookieProcessor.readAccessCookie(event);
        if (!accessToken) {
            throw ErrorUtils.fromMissingCookieError('access token');
        }

        // Forward the access token to the target API
        const apiResponse = await this.callApi(event, accessToken);
        return ResponseWriter.objectResponse(apiResponse.status, apiResponse.data, apiResponse.headers);
    }

    /*
     * Call the target API with an access token
     */
    public async callApi(event: APIGatewayProxyExtendedEvent, accessToken: string): Promise<any> {

        // Get the route, which has been verified by the authorizer middleware
        const apiRoute = PathProcessor.findApiRoute(event, this.apiRoutes);
        if (!apiRoute) {
            throw ErrorUtils.fromInvalidRouteError();
        }

        // Calculate the full target path
        const fullPath = PathProcessor.getFullPath(event);
        const fullPathToForward = fullPath.replace(apiRoute.path, '');
        const url = `${apiRoute.target}${fullPathToForward}`;
        console.log(url);

        const headers: any  = {
            'accept': 'application/json',
            'authorization': `Bearer ${accessToken}`,
        };

        // Set request options
        const options: RequestInit = {
            method: event.httpMethod,
            headers,
        };

        // Forward headers that clients may send or that the API generates for correlation
        headers['correlation-id'] = event.logEntry.getCorrelationId();
        const apiToBreak = event.headers['api-exception-simulation'] as string;
        if (apiToBreak) {
            headers['api-exception-simulation'] = apiToBreak;
        }

        // Supply a body to the API if required
        if (event.body) {
            headers['content-type'] = 'application/json';
            options.body = JSON.stringify(event.body);
        }

        try {

            // Handle successful requests
            const response = await fetch(url, options);
            if (response.ok) {

                const data = await response.json() as any;
                return {
                    status: response.status,
                    data,
                };
            }

            // Handle failed requests
            const responseBody = await response.json() as any;

            // Change the error field names for OAuth user info error responses
            if (responseBody.error && responseBody.error_description) {

                responseBody.code = responseBody.error;
                responseBody.message = responseBody.error_description;
                delete responseBody.error;
                delete responseBody.error_description;
            }

            // Return upstream errors without additional logging
            return {
                status: response.status,
                data: responseBody,
            };

        } catch (e: any) {

            // If JSON handling fails or there is a connectivity problem, process the error here
            throw ErrorUtils.fromFetchError(e, url, 'web API');
        }
    }
}
