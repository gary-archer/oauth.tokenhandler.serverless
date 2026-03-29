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
        const defaultMessage = 'An unexpected exception occurred in the token handler';

        // Create the error
        const error = ErrorFactory.createServerError(
            errorCode || defaultErrorCode,
            message || defaultMessage,
            exception.stack);

        error.setDetails(ErrorUtils.getExceptionMessage(exception));
        return error;
    }

    /*
     * Handle routes that do not exist
     */
    public static fromInvalidRouteError(): ClientError {
        return ErrorFactory.createClientError(404, ErrorCodes.invalidRoute, 'The API route requested does not exist');
    }

    /*
     * Handle incoming requests without the token-handler-version header
     */
    public static fromMissingCustomHeaderError(): ClientError {

        const error = ErrorFactory.createClient401Error(
            'A request did not contain the required custom header');

        const logContext = error.getLogContext();
        logContext.errorCode = ErrorCodes.missingCustomHeader;

        return error;
    }

    /*
     * Throw an exception for the SPA when there is a login response error from the authorization server
     */
    public static fromLoginResponseError(
        statusCode: number,
        errorCode: string,
        errorDescription: string | null): ClientError {

        const description = errorDescription || 'A login error response was received from the authorization server';
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
     * Exceptions during fetches could be caused by misconfiguration, server unavailable or JSON parsing failures
     */
    public static fromFetchError(exception: any, url: string, source: string): ClientError | ServerError {

        if (exception instanceof ServerError || exception instanceof ClientError) {
            return exception;
        }

        const error = ErrorFactory.createServerError(
            ErrorCodes.fetchError,
            `Problem encountered connecting to the ${source}`,
            exception.stack);

        error.setDetails(`${ErrorUtils.getExceptionMessage(exception)}, URL: ${url}`);
        return error;
    }

    /*
     * Handle OAuth grant errors, where session expiry is an expected condition
     */
    public static async fromOAuthGrantResponseError(response: Response, grantType: string):
        Promise<ClientError | ServerError> {

        let code = ErrorCodes.fetchError;
        let message = 'An error response was returned from the token endpoint';

        try {

            const data = await response.json() as any;
            if (data) {

                if (data.error) {
                    code = data.error;
                }
                if (data.error_description) {
                    message = data.error_description;
                }
            }

        } catch {
            // Swallow JSON parse errors for unexpected responses
        }

        if (grantType === 'refresh_token' && code === ErrorCodes.invalidGrantError) {
            return ErrorFactory.createClientError(401, ErrorCodes.sessionExpiredError, 'The user must reauthenticate');
        }

        return ErrorFactory.createServerError(code, message);
    }

    /*
     * If there is an error validation ID tokens report it as a server error
     */
    public static fromIdTokenValidationError(details: string): ServerError {

        const description = 'ID token validation failure';
        const error = ErrorFactory.createServerError(ErrorCodes.idTokenValidationError, description);
        error.setDetails(details);
        return error;
    }

    /*
     * Indicate if a token is missing, which most commonly would be caused by a configuration problem
     */
    public static createInvalidOAuthResponseError(message: string): ServerError {
        return ErrorFactory.createServerError(ErrorCodes.invalidOAuthResponse, message);
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

        const details = `Cookie decryption failed: ${ErrorUtils.getExceptionMessage(exception)}`;
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
     * Get the message from an exception
     */
    private static getExceptionMessage(exception: any): string {

        // Prefer to return a code and message
        const code = exception?.code || exception?.cause?.code || '';
        const message = exception.message || '';

        const parts = [];
        if (code) {
            parts.push(code);
        }
        if (code) {
            parts.push(message);
        }

        if (parts.length > 0) {
            return parts.join(', ');
        }

        // Otherwise get raw details and avoid returning [object Object]
        const details = exception.toString();
        if (details !== {}.toString()) {
            return details;
        }

        return '';
    }
}
