import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import middy from '@middy/core';
import {Configuration} from '../configuration/configuration.js';
import {PathProcessor} from '../http/pathProcessor.js';

/*
 * A middleware to add CORS response headers
 */
export class CorsMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    private readonly _configuration: Configuration;

    public constructor(configuration: Configuration) {
        this._configuration = configuration;
        this._setupCallbacks();
    }

    /*
     * Run after a lambda completes successfully
     */
    public after(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {
        this._addResponseHeaders(request);
    }

    /*
     * Run after a lambda fails and returns an error
     */
    public onError(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {

        this._addResponseHeaders(request);
    }

    /*
     * Do the work of adding the CORS repsonse headers needed by the SPA
     */
    private _addResponseHeaders(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {

        // Only add headers for trusted origins
        const origin = this._readHeader('origin', request.event);
        if (this._isTrustedOrigin(request.event, origin) && request.response) {

            const headers = request.response!.headers || {};

            // Always return these two CORS response headers
            headers['access-control-allow-origin'] = origin!;
            headers['access-control-allow-credentials'] = 'true';
            headers['vary'] = 'origin';

            // Add extra CORS response headers for pre-flight requests
            if (request.event.httpMethod.toLowerCase() === 'options') {

                // Use easy to manage defaults
                headers['access-control-allow-methods'] = 'OPTIONS,HEAD,GET,POST,PUT,PATCH,DELETE';
                headers['access-control-max-age'] = 86400;

                // Return the headers requested by the browser
                const requestedHeaders = this._readHeader('access-control-request-headers', request.event);
                if (requestedHeaders) {
                    headers['access-control-allow-headers'] = requestedHeaders;
                    headers['vary'] = 'origin,access-control-request-headers';
                }
            }

            // Set the final headers to return
            request.response!.headers = headers;
        }
    }

    /*
     * We only add CORS response headers for trusted web origins
     */
    private _isTrustedOrigin(event: APIGatewayProxyEvent, origin: string | null): boolean {

        if (!origin) {
            return false;
        }

        const route = PathProcessor.findRoute(event, this._configuration.routes);
        if (!route) {
            return false;
        }

        const cors = route.plugins.find((p) => p === 'cors');
        if (!cors) {
            return false;
        }

        if (origin.toLowerCase() !== this._configuration.cors.trustedWebOrigin.toLowerCase()) {
            return false;
        }

        return true;
    }

    /*
     * Read a single value header value
     */
    private _readHeader(name: string, event: APIGatewayProxyEvent): string | null {

        if (event.headers) {

            const found = Object.keys(event.headers).find((h) => h.toLowerCase() === name.toLowerCase());
            if (found) {
                return event.headers[found] as string;
            }
        }

        return null;
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.after = this.after.bind(this);
        this.onError = this.onError.bind(this);
    }
}
