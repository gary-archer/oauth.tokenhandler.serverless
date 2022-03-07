import {ClientError} from './clientError';
import {ErrorCodes} from './errorCodes';
import {ErrorFactory} from './errorFactory';
import {ServerError} from './serverError';

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
        const defaultMessage = 'An unexpected exception occurred in the reverse proxy';

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
        logContext.code = ErrorCodes.missingWebOrigin;

        return error;
    }

    /*
     * Indicate an untrusted web origin
     */
    public static fromUntrustedOriginError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'A request from a CORS client had an untrusted web origin');

        const logContext = error.getLogContext();
        logContext.code = ErrorCodes.untrustedWebOrigin;

        return error;
    }

    /*
     * Indicate a cookie not sent, which could be a browser issue
     */
    public static fromMissingCookieError(name: string): ClientError {

        const error = ErrorFactory.createClient401Error(
            `The ${name} cookie was not received in an incoming request`);

        const logContext = error.getLogContext();
        logContext.code = ErrorCodes.cookieNotFoundError;

        return error;
    }

    /*
     * This occurs if the anti forgery token was not provided
     */
    public static fromMissingAntiForgeryTokenError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'An anti forgery request header was not supplied for a data changing command');

        const logContext = error.getLogContext();
        logContext.code = ErrorCodes.missingAntiForgeryTokenError;

        return error;
    }

    /*
     * This occurs if the anti forgery token does not have the expected value
     */
    public static fromMismatchedAntiForgeryTokenError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'The anti forgery request header value does not match that of the request cookie');

        const logContext = error.getLogContext();
        logContext.code = ErrorCodes.mismatchedAntiForgeryTokenError;

        return error;
    }

    /*
     * Handle failed cookie decryption
     */
    public static fromMalformedCookieError(name: string, message: string): ClientError {

        const details = `Malformed cookie received: ${message}`;
        const error = ErrorFactory.createClient401Error(details);

        const logContext = error.getLogContext();
        logContext.code = ErrorCodes.cookieDecryptionError;
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
        logContext.code = ErrorCodes.cookieDecryptionError;
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
