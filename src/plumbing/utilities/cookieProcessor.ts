import {APIGatewayProxyEvent} from 'aws-lambda';
import base64url from 'base64url';
import cookie from 'cookie';
import crypto from 'crypto';
import {OAuthProxyConfiguration} from '../configuration/oauthProxyConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {HeaderProcessor} from './headerProcessor';

/*
 * A class to deal with cookie concerns
 */
export class CookieProcessor {

    private readonly _configuration: OAuthProxyConfiguration;

    public constructor(configuration: OAuthProxyConfiguration) {
        this._configuration = configuration;
    }

    /*
     * For data changing commands, enforce double sumbit cookie checks
     */
    public enforceCsrfChecks(event: APIGatewayProxyEvent): void {

        const csrfName = 'csrf';
        const csrfCookie = this._readCookie(csrfName, event);
        if (!csrfCookie) {
            throw ErrorUtils.fromMissingCookieError(csrfName);
        }

        const csrfHeader = HeaderProcessor.readHeader(`x-${this._configuration.cookiePrefix}-${csrfName}`, event);
        if (!csrfHeader) {
            throw ErrorUtils.fromMissingAntiForgeryTokenError();
        }

        const csrfToken = this._decryptCookie(csrfName, csrfCookie);
        if (csrfHeader !== csrfToken) {
            throw ErrorUtils.fromMismatchedAntiForgeryTokenError();
        }
    }

    /*
     * Try to get the access token from the secure cookie, to forward to the target API
     */
    public getAccessToken(event: APIGatewayProxyEvent): string {

        const atName = 'atx';
        const accessCookie = this._readCookie(atName, event);
        if (!accessCookie) {
            throw ErrorUtils.fromMissingCookieError(atName);
        }

        // Finally decrypt the cookie to get the access token
        return this._decryptCookie(atName, accessCookie);
    }

    /*
     * Try to read a field from the cookie header
     */
    private _readCookie(name: string, event: APIGatewayProxyEvent): string | null {

        let result = null;
        const cookieName = `${this._configuration.cookiePrefix}-${name}`;

        const headers = HeaderProcessor.readMultiValueHeader('cookie', event);
        headers.forEach((h) => {

            const data = cookie.parse(h);
            if (data[cookieName]) {
                result = data[cookieName];
            }
        });

        return result;
    }

    /*
     * A helper method to decrypt a cookie using AES256-GCM and report errors clearly
     */
    private _decryptCookie(cookieName: string, encryptedData: string): string {

        const VERSION_SIZE = 1;
        const GCM_IV_SIZE = 12;
        const GCM_TAG_SIZE = 16;
        const CURRENT_VERSION = 1;

        const allBytes = base64url.toBuffer(encryptedData);

        const minSize = VERSION_SIZE + GCM_IV_SIZE + 1 + GCM_TAG_SIZE;
        if (allBytes.length < minSize) {
            throw ErrorUtils.fromMalformedCookieError(cookieName, 'The received cookie has an invalid length');
        }

        const version = allBytes[0];
        if (version != CURRENT_VERSION) {
            throw ErrorUtils.fromMalformedCookieError(cookieName, 'The received cookie has an invalid format');
        }

        let offset = VERSION_SIZE;
        const ivBytes = allBytes.slice(offset, offset + GCM_IV_SIZE);

        offset += GCM_IV_SIZE;
        const ciphertextBytes = allBytes.slice(offset, allBytes.length - GCM_TAG_SIZE);

        offset = allBytes.length - GCM_TAG_SIZE;
        const tagBytes = allBytes.slice(offset, allBytes.length);

        try {

            const encKeyBytes = Buffer.from(this._configuration.cookieDecryptionKey, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', encKeyBytes, ivBytes);
            decipher.setAuthTag(tagBytes);

            const decryptedBytes = decipher.update(ciphertextBytes);
            const finalBytes = decipher.final();

            const plaintextBytes = Buffer.concat([decryptedBytes, finalBytes]);
            return plaintextBytes.toString();

        } catch (e: any) {

            // Log decryption errors clearly
            throw ErrorUtils.fromCookieDecryptionError(cookieName, e);
        }
    }
}