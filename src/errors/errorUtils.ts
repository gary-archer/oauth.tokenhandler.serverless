import {ClientError} from './clientError.js';
import {ErrorCodes} from './errorCodes.js';
import {ErrorFactory} from './errorFactory.js';
import {ServerError} from './serverError.js';

/*
 * Error utility functions for OAuth and general processing
 */
export class ErrorUtils {

    /*
     * Return or create a typed error
     */
    public static fromException(exception: any): ServerError | ClientError {

        const serverError = this.tryConvertToServerError(exception);
        if (serverError !== null) {
            return serverError;
        }

        const clientError = this.tryConvertToClientError(exception);
        if (clientError !== null) {
            return clientError;
        }

        return ErrorUtils.createServerError(exception);
    }

    /*
     * Create an error from an exception
     */
    public static createServerError(exception: any, errorCode?: string, message?: string): ServerError {

        // Default details
        const defaultErrorCode = ErrorCodes.serverError;
        const defaultMessage = 'An unexpected exception occurred in the token handler';

        // Create the error
        const error = ErrorFactory.createServerError(
            errorCode || defaultErrorCode,
            message || defaultMessage,
            exception.stack);

        error.setDetails(ErrorUtils.getExceptionDetailsMessage(exception));
        return error;
    }

    /*
     * Handle routes that do not exist
     */
    public static fromInvalidRouteError(): ClientError {
        return ErrorFactory.createClientError(404, ErrorCodes.invalidRoute, 'The API route requested does not exist');
    }

    /*
     * All standards based browsers should send an origin header
     */
    public static fromMissingOriginError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'A request from a CORS client was received with no origin header');

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.missingWebOrigin;

        return error;
    }

    /*
     * Indicate an untrusted web origin
     */
    public static fromUntrustedOriginError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'A request from a CORS client had an untrusted web origin');

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.untrustedWebOrigin;

        return error;
    }

    /*
     * Throw an exception for the SPA when there is a login response error from the Authorization Server
     */
    public static fromLoginResponseError(
        statusCode: number,
        errorCode: string,
        errorDescription: string | null): ClientError {

        const description = errorDescription || 'A login error response was received from the Authorization Server';
        return ErrorFactory.createClientError(statusCode, errorCode, description);
    }

    /*
     * This occurs if the state does not have the expected value
     */
    public static fromInvalidStateError(): ClientError {

        const error = ErrorFactory.createClient401Error('OAuth response state did not match the cookie request state');
        error.setLogContext({
            code: ErrorCodes.invalidStateError,
        });

        return error;
    }

    /*
     * Throw an exception for the SPA when there is a back channel response error from the Authorization Server
     */
    public static fromTokenResponseError(
        statusCode: number,
        errorCode: string,
        errorDescription: string | null,
        url: string): ClientError {

        const description = errorDescription || 'A token error response was received from the Authorization Server';

        const error = ErrorFactory.createClientError(statusCode, errorCode, description);
        error.setLogContext({
            url,
        });

        return error;
    }

    /*
     * Indicate if a token is missing, which most commonly would be caused by a configuration problem
     */
    public static createInvalidOAuthResponseError(message: string): ServerError {
        return ErrorFactory.createServerError(ErrorCodes.invalidOAuthResponse, message);
    }

    /*
     * Handle failed HTTP connectivity problems in OAuth requests
     */
    public static fromOAuthHttpRequestError(exception: any, url: string): ServerError {

        const error = ErrorFactory.createServerError(
            ErrorCodes.httpRequestError,
            'Problem encountered connecting to the Authorization Server',
            exception.stack);

        error.setDetails(`${ErrorUtils.getExceptionDetailsMessage(exception)}, URL: ${url}`);
        return error;
    }

    /*
     * Handle failed HTTP connectivity problems in API requests
     */
    public static fromApiHttpRequestError(exception: any, url: string): ServerError {

        const error = ErrorFactory.createServerError(
            ErrorCodes.httpRequestError,
            'Problem encountered connecting to a target API',
            exception.stack);

        error.setDetails(`${ErrorUtils.getExceptionDetailsMessage(exception)}, URL: ${url}`);
        return error;
    }

    /*
     * This occurs if a required field was not found in a form post
     */
    public static fromMissingJsonFieldError(name: string): ClientError {

        const error = ErrorFactory.createClient401Error(
            `The ${name} field was missing in an incoming request`);

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.fieldNotFoundError;

        return error;
    }

    /*
     * Indicate a cookie not sent, which could be a browser issue
     */
    public static fromMissingCookieError(name: string): ClientError {

        const error = ErrorFactory.createClient401Error(
            `The ${name} cookie was not received in an incoming request`);

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.cookieNotFoundError;

        return error;
    }

    /*
     * This occurs if the anti forgery token was not provided
     */
    public static fromMissingAntiForgeryTokenError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'An anti forgery request header was not supplied for a data changing command');

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.missingAntiForgeryTokenError;

        return error;
    }

    /*
     * This occurs if the anti forgery token does not have the expected value
     */
    public static fromMismatchedAntiForgeryTokenError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'The anti forgery request header value does not match that of the request cookie');

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.mismatchedAntiForgeryTokenError;

        return error;
    }

    /*
     * Handle failed cookie decryption
     */
    public static fromMalformedCookieError(name: string, message: string): ClientError {

        const details = `Malformed cookie received: ${message}`;
        const error = ErrorFactory.createClient401Error(details);

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.cookieDecryptionError;
        logContext.name = name;

        return error;
    }

    /*
     * Handle failed cookie decryption
     */
    public static fromCookieDecryptionError(name: string, exception: any): ClientError {

        const details = `Cookie decryption failed: ${ErrorUtils.getExceptionDetailsMessage(exception)}`;
        const error = ErrorFactory.createClient401Error(details);

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.cookieDecryptionError;
        logContext.name = name;

        return error;
    }

    /*
     * Try to convert an exception to a server error
     */
    private static tryConvertToServerError(exception: any): ServerError | null {

        if (exception instanceof ServerError) {
            return exception;
        }

        return null;
    }

    /*
     * Try to convert an exception to the ClientError interface
     * At runtime the type no interface details are available so we have to check for known members
     */
    private static tryConvertToClientError(exception: any): ClientError | null {

        if (exception.getStatusCode && exception.toResponseFormat && exception.toLogFormat) {
            return exception as ClientError;
        }

        return null;
    }

    /*
     * Get the message from an exception and avoid returning [object Object]
     */
    public static getExceptionDetailsMessage(e: any): string {

        if (e.message) {
            return e.message;
        }

        const details = e.toString();
        if (details !== {}.toString()) {
            return details;
        }

        return '';
    }
}
