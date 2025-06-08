import {ErrorCodes} from './errorCodes.js';

/*
 * Return the correct status code for OAuth errors
 */
export class OAuthErrorStatus {

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
