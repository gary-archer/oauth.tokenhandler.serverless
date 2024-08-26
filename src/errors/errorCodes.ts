/*
 * A list of error codes
 */
export class ErrorCodes {

    public static readonly invalidRoute = 'route_not_found';

    public static readonly missingCustomHeader = 'missing_custom_header';

    public static readonly invalidStateError = 'invalid_state';

    public static readonly httpRequestError = 'http_request_error';

    public static readonly fieldNotFoundError = 'field_not_found';

    public static readonly cookieNotFoundError = 'cookie_not_found';

    public static readonly cookieDecryptionError = 'cookie_decryption_error';

    public static readonly invalidOAuthResponse = 'invalid_oauth_response';

    public static readonly unauthorizedRequest = 'unauthorized';

    public static readonly invalidGrantError = 'invalid_grant';

    public static readonly sessionExpiredError = 'session_expired';

    public static readonly serverError = 'server_error';
}
