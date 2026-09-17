import {APIGatewayProxyResult} from 'aws-lambda';
import middy from '@middy/core';
import {Configuration} from '../configuration/configuration';
import {ErrorUtils} from '../errors/errorUtils';
import {HeaderProcessor} from '../http/headerProcessor';
import {APIGatewayProxyExtendedEvent} from '../utilities/apiGatewayProxyExtendedEvent';

/*
 * A middleware to add CORS response headers
 */
export class CorsMiddleware implements middy.MiddlewareObj<APIGatewayProxyExtendedEvent, APIGatewayProxyResult> {

    private readonly configuration: Configuration;

    public constructor(configuration: Configuration) {
        this.configuration = configuration;
        this.setupCallbacks();
    }

    /*
     * Run after a lambda completes successfully
     */
    public after(request: middy.Request<APIGatewayProxyExtendedEvent, APIGatewayProxyResult>): void {
        this.addResponseHeaders(request);
    }

    /*
     * Run after a lambda fails and returns an error
     */
    public onError(request: middy.Request<APIGatewayProxyExtendedEvent, APIGatewayProxyResult>): void {

        this.addResponseHeaders(request);
    }

    /*
     * Do the work of adding the CORS repsonse headers needed by the SPA
     */
    private addResponseHeaders(request: middy.Request<APIGatewayProxyExtendedEvent, APIGatewayProxyResult>): void {

        if (this.isTrustedOrigin(request.event) && request.response) {

            const headers = request.response?.headers || {};

            // Always return these two CORS response headers
            headers['access-control-allow-origin'] = this.configuration.cors.trustedWebOrigin;
            headers['access-control-allow-credentials'] = 'true';
            headers['vary'] = 'origin';

            // Add extra CORS response headers for pre-flight requests
            if (request.event.httpMethod.toLowerCase() === 'options') {

                // Use easy to manage defaults
                headers['access-control-allow-methods'] = 'OPTIONS,HEAD,GET,POST,PUT,PATCH,DELETE';
                headers['access-control-max-age'] = 86400;

                // Return the headers requested by the browser
                const requestedHeaders = this.readHeader('access-control-request-headers', request.event);
                if (requestedHeaders) {
                    headers['access-control-allow-headers'] = requestedHeaders;
                    headers['vary'] = 'origin,access-control-request-headers';
                }
            } else {

                // On the main request, require the custom header that ensure triggering of CORS preflights
                const headerValue = HeaderProcessor.readHeader(request.event, 'token-handler-version');
                if (headerValue != '1') {
                    throw ErrorUtils.fromMissingCustomHeaderError();
                }
            }

            // Set the final headers to return
            request.response.headers = headers;
        }
    }

    /*
     * We only add CORS response headers for the trusted web origin
     */
    private isTrustedOrigin(event: APIGatewayProxyExtendedEvent): boolean {

        const origin = this.readHeader('origin', event);
        if (!origin) {
            return false;
        }

        return origin.toLowerCase() === this.configuration.cors.trustedWebOrigin.toLowerCase();
    }

    /*
     * Read a single value header value
     */
    private readHeader(name: string, event: APIGatewayProxyExtendedEvent): string | null {

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
    private setupCallbacks(): void {
        this.after = this.after.bind(this);
        this.onError = this.onError.bind(this);
    }
}
