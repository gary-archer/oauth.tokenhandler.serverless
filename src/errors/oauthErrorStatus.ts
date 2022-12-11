import {ErrorCodes} from './errorCodes';

/*
 * Most 4xx errors from the Authorization Server are returned as 4xx errors and the UI displays an error
 * Typically these will represent a configuration error that the SPA cannot fix
 * For expiry related errors return 401 so that the UI can try a renewal action and avoid a user error display
 */
export class OAuthErrorStatus {

    /*
     * A login with prompt=none could return login_required as an expiry error
     */
    public static processAuthorizationResponseError(errorCode: string): number {

        if (errorCode === 'login_required') {
            return 401;
        }

        return 400;
    }

    /*
     * Refresh token expiry is expected and we indicate session expired in this case
     */
    public static processTokenResponseError(
        grantType: string,
        statusCode: number,
        errorCode: string): [number, string] {

        if (statusCode >= 400 && statusCode < 500) {

            if (grantType === 'refresh_token' && errorCode === ErrorCodes.invalidGrantError) {
                return [401, ErrorCodes.sessionExpiredError];
            }

            return [400, errorCode];
        }

        return [statusCode, errorCode];
    }
}
