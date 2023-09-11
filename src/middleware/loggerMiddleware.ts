import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {LoggerFactory} from '../logging/loggerFactory.js';
import {Container} from '../utilities/container.js';

/*
 * The middleware coded in a class based manner
 */
export class LoggerMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    private readonly _container: Container;
    private readonly _loggerFactory: LoggerFactory;

    public constructor(container: Container, loggerFactory: LoggerFactory) {
        this._container = container;
        this._loggerFactory = loggerFactory;
        this._setupCallbacks();
    }

    /*
     * Start logging when a request begins
     */
    public before(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {

        // Create the log entry for the current request
        const logEntry = this._loggerFactory.createLogEntry();
        this._container.setLogEntry(logEntry);

        // Start request logging
        logEntry.start(request.event);
    }

    /*
     * Finish logging after normal completion
     */
    public after(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {

        // Get the log entry
        const logEntry = this._container.getLogEntry();

        // End logging
        if (request.response && request.response.statusCode) {
            logEntry.setResponseStatus(request.response.statusCode);
        }
        logEntry.write();
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.before = this.before.bind(this);
        this.after = this.after.bind(this);
    }
}
