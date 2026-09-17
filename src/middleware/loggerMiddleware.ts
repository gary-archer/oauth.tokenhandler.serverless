import middy from '@middy/core';
import {APIGatewayProxyResult} from 'aws-lambda';
import {LoggerFactory} from '../logging/loggerFactory';
import {APIGatewayProxyExtendedEvent} from '../utilities/apiGatewayProxyExtendedEvent';

/*
 * The middleware coded in a class based manner
 */
export class LoggerMiddleware implements middy.MiddlewareObj<APIGatewayProxyExtendedEvent, APIGatewayProxyResult> {

    private readonly loggerFactory: LoggerFactory;

    public constructor(loggerFactory: LoggerFactory) {
        this.loggerFactory = loggerFactory;
        this.setupCallbacks();
    }

    /*
     * Start logging when a request begins
     */
    public before(request: middy.Request<APIGatewayProxyExtendedEvent, APIGatewayProxyResult>): void {

        // Create the log entry for the current request
        const logEntry = this.loggerFactory.createLogEntry();
        request.event.logEntry = logEntry;

        // Start request logging
        logEntry.start(request.event);
    }

    /*
     * Finish logging after normal completion
     */
    public after(request: middy.Request<APIGatewayProxyExtendedEvent, APIGatewayProxyResult>): void {

        // Get the log entry for the current request
        const logEntry = request.event.logEntry;

        // End logging
        if (request.response && request.response.statusCode) {
            logEntry.setResponseStatus(request.response.statusCode);
        }
        logEntry.write();
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private setupCallbacks(): void {
        this.before = this.before.bind(this);
        this.after = this.after.bind(this);
    }
}
