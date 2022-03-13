/*
 * A list of error codes
 */
export class ErrorCodes {

    public static readonly invalidRoute = 'route_not_found';

    public static readonly missingWebOrigin = 'missing_web_origin';

    public static readonly untrustedWebOrigin = 'untrusted_web_origin';

    public static readonly httpRequestError = 'http_request_error';

    public static readonly cookieNotFoundError = 'cookie_not_found';

    public static readonly cookieDecryptionError = 'cookie_decryption_error';

    public static readonly missingAntiForgeryTokenError = 'missing_csrf_token';

    public static readonly mismatchedAntiForgeryTokenError = 'mismatched_csrf_token';

    public static readonly formFieldNotFoundError = 'form_field_not_found';

    public static readonly unauthorizedRequest = 'unauthorized';

    public static readonly serverError = 'server_error';
}
