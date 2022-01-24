import {GatewayError} from './gatewayError';
import {GatewayErrorCodes} from './gatewayErrorCodes';

/*
 * Gateway error utility functions
 */
export class GatewayErrorUtils {

    /*
     * Handle server errors during processing
     */
    public static fromException(e: any): GatewayError {

        if (e instanceof GatewayError) {
            return e;
        }

        const error = new GatewayError(
            500,
            GatewayErrorCodes.serverError,
            'Problem encountered in the API gateway');

        const message = GatewayErrorUtils._getExceptionDetails(e);
        error.logContext = {
            message,
        };

        return error;
    }

    /*
     * All standards based browsers should send an origin header, so fail if one is not received
     */
    public static fromMissingOriginError(): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.missingWebOrigin,
        };

        return error;
    }

    /*
     * Indicate an untrusted web origin
     */
    public static fromUntrustedOriginError(): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.untrustedWebOrigin,
        };

        return error;
    }

    /*
     * Indicate a cookie not sent, which could be a browser issue
     */
    public static fromMissingCookieError(name: string): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.cookieNotFoundError,
            name,
        };

        return error;
    }

    /*
     * Handle the error for key identifier lookups
     */
    public static fromCookieNotFoundError(name: string, message: string): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.cookieNotFoundError,
            name,
            message,
        };

        return error;
    }

    /*
     * Handle the error for key identifier lookups
     */
    public static fromMalformedCookieError(name: string, message: string): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.cookieMalformedError,
            name,
            message,
        };

        return error;
    }

    /*
     * This occurs if the anti forgery token was not provided
     */
    public static fromMissingAntiForgeryTokenError(): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.missingAntiForgeryTokenError,
        };

        return error;
    }

    /*
     * This occurs if the anti forgery token does not have the expected value
     */
    public static fromMismatchedAntiForgeryTokenError(): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.mismatchedAntiForgeryTokenError,
        };

        return error;
    }

    /*
     * Handle the error for key identifier lookups
     */
    public static fromCookieDecryptionError(cookieName: string, exception: any): GatewayError {

        const error = GatewayErrorUtils._createGeneric401Error();
        error.logContext = {
            code: GatewayErrorCodes.cookieDecryptionError,
            details: this._getExceptionDetails(exception),
        };

        return error;
    }

    /*
     * In many cases we avoid giving away security details by returning this error while logging more useful details
     */
    private static _createGeneric401Error(): GatewayError {

        return new GatewayError(
            401,
            GatewayErrorCodes.accessDeniedError,
            'Access was denied due to invalid request details');
    }

    /*
     * Get the message from an exception and avoid returning [object Object]
     */
    private static _getExceptionDetails(e: any): string {

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
