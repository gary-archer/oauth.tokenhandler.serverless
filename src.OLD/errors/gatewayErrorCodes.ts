/*
 * A list of base framework error codes
 */
export class GatewayErrorCodes {

    // A server error processing a cookie request
    public static readonly serverError = 'server_error';

    // A generic 401 error returned to clients who send incorrect data
    public static readonly accessDeniedError = 'access_denied';

    // No origin header was supplied
    public static readonly missingWebOrigin = 'missing_web_origin';

    // An untrusted browser origin called the gateway
    public static readonly untrustedWebOrigin = 'untrusted_web_origin';

    // An error to indicate a cookie not found, which could possibly be a browser issue
    public static readonly cookieNotFoundError = 'cookie_not_found';

    // An error to indicate that a cookie with invalid data was found
    public static readonly cookieMalformedError = 'cookie_malformed';

    // An error to indicate a cookie could not be decrypted, if for example it was truncated
    public static readonly cookieDecryptionError = 'cookie_decryption_error';

    // An error to indicate that the request header was missing
    public static readonly missingAntiForgeryTokenError = 'missing_csrf_token';

    // An error to indicate that the request header and secure cookie do not match
    public static readonly mismatchedAntiForgeryTokenError = 'mismatched_csrf_token';
}
