import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import middy from '@middy/core';
import {ClientError} from '../errors/clientError';
import {ErrorUtils} from '../errors/errorUtils';
import {ServerError} from '../errors/serverError';
import {ResponseWriter} from '../http/responseWriter';
import {LoggerFactory} from '../logging/loggerFactory';
import {Container} from '../utilities/container';

/*
 * The exception middleware coded in a class based manner
 */
export class ExceptionMiddleware implements middy.MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> {

    private readonly _container: Container;
    private readonly _apiName: string;

    public constructor(container: Container, loggerFactory: LoggerFactory) {
        this._container = container;
        this._apiName = loggerFactory.apiName;
        this._setupCallbacks();
    }

    /*
     * All exceptions are caught and returned from AWS here
     */
    public onError(request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult>): void {

        // Get the log entry
        const logEntry = this._container.getLogEntry();

        // Get the error into a known object
        const error = ErrorUtils.fromException(request.error);

        let clientError: ClientError;
        if (error instanceof ServerError) {

            // Log the exception and convert to the client error
            logEntry.setServerError(error);
            clientError = error.toClientError(this._apiName);

        } else {

            // Inform the client of an invalid request
            logEntry.setClientError(error);
            clientError = error;
        }

        // In some cases we return a generic error code to the client and log a more specific one
        const logContext = clientError.getLogContext();
        if (logContext && logContext.code) {
            logEntry.setErrorCodeOverride(logContext.code);
        }

        // Finish the log entry for the exception case
        logEntry.setResponseStatus(clientError.getStatusCode());
        logEntry.write();

        // Set the client error as the lambda response error, which will be serialized and returned via the API gateway
        request.response = ResponseWriter.objectResponse(clientError.getStatusCode(), clientError.toResponseFormat());
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private _setupCallbacks(): void {
        this.onError = this.onError.bind(this);
    }
}
