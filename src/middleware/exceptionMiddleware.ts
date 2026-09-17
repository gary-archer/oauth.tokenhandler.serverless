import {APIGatewayProxyResult} from 'aws-lambda';
import middy from '@middy/core';
import {Configuration} from '../configuration/configuration';
import {ClientError} from '../errors/clientError';
import {ErrorCodes} from '../errors/errorCodes';
import {ErrorUtils} from '../errors/errorUtils';
import {ServerError} from '../errors/serverError';
import {CookieProcessor} from '../http/cookieProcessor';
import {ResponseWriter} from '../http/responseWriter';
import {LoggerFactory} from '../logging/loggerFactory';
import {APIGatewayProxyExtendedEvent} from '../utilities/apiGatewayProxyExtendedEvent';

/*
 * The exception middleware coded in a class based manner
 */
export class ExceptionMiddleware implements middy.MiddlewareObj<APIGatewayProxyExtendedEvent, APIGatewayProxyResult> {

    private readonly configuration: Configuration;
    private readonly apiName: string;

    public constructor(configuration: Configuration, loggerFactory: LoggerFactory) {
        this.configuration = configuration;
        this.apiName = loggerFactory.apiName;
        this.setupCallbacks();
    }

    /*
     * All exceptions are caught and returned from AWS here
     */
    public onError(request: middy.Request<APIGatewayProxyExtendedEvent, APIGatewayProxyResult>): void {

        // Get the log entry
        const logEntry = request.event.logEntry;

        // Get the error into a known object
        const error = ErrorUtils.fromException(request.error);

        let clientError: ClientError;
        if (error instanceof ServerError) {

            // Log the exception and convert to the client error
            logEntry.setServerError(error);
            clientError = error.toClientError(this.apiName);

        } else {

            // Inform the client of an invalid request
            logEntry.setClientError(error);
            clientError = error;
        }

        // In some cases we return a generic error code to the client and log a more specific one
        const logContext = clientError.getLogContext();
        if (logContext && logContext.errorCode) {
            logEntry.setErrorCodeOverride(logContext.errorCode);
        }

        // Finish the log entry for the exception case
        logEntry.setResponseStatus(clientError.getStatusCode());
        logEntry.write();

        // Set the client error as the lambda response error, which will be serialized and returned via the API gateway
        request.response = ResponseWriter.objectResponse(clientError.getStatusCode(), clientError.toResponseFormat());

        // Handle the special session expire case, and clear all cookies
        if (clientError.getStatusCode() === 401 && clientError.getErrorCode() === ErrorCodes.sessionExpiredError) {

            const cookieProcessor = new CookieProcessor(this.configuration.cookie);
            request.response.multiValueHeaders = {
                'set-cookie': cookieProcessor.expireAllCookies()
            };
        }
    }

    /*
     * Plumbing to ensure that the this parameter is available in async callbacks
     */
    private setupCallbacks(): void {
        this.onError = this.onError.bind(this);
    }
}
