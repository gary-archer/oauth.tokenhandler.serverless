import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {ErrorUtils} from '../errors/errorUtils';
import {HeaderProcessor} from '../http/headerProcessor';

/*
 * A middleware to check for the required custom header
 */
export class RequiredHeaderMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    public constructor() {
        this.setupCallbacks();
    }

    /*
     * Authorize requests depending on how the route is configured and whether a pre-flight request
     */
    public async before(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): Promise<void> {

        // All OPTIONS responses return 204 so avoid throwing errors
        const method = request.event.httpMethod.toLowerCase();
        if (method === 'options') {
            return;
        }

        // Always enforce the required custom header
        const headerValue = HeaderProcessor.readHeader(request.event, 'token-handler-version');
        if (headerValue != '1') {
            throw ErrorUtils.fromMissingCustomHeaderError();
        }
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private setupCallbacks(): void {
        this.before = this.before.bind(this);
    }
}
