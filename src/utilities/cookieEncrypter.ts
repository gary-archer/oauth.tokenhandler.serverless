import crypto from 'crypto';
import {CookieConfiguration} from '../configuration/cookieConfiguration.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {Base64Url} from './base64url.js';

const VERSION_SIZE = 1;
const GCM_IV_SIZE = 12;
const GCM_TAG_SIZE = 16;
const CURRENT_VERSION = 1;

/*
 * A class to deal with cookie encryption
 */
export class CookieEncrypter {

    private readonly _configuration: CookieConfiguration;

    public constructor(configuration: CookieConfiguration) {
        this._configuration = configuration;
    }

    /*
     * Encrypt data using the Curity format, as AES26-GCM bytes and then base64url encode it
     */
    public encryptCookie(plaintext: string): string {

        const ivBytes = crypto.randomBytes(GCM_IV_SIZE);
        const encKeyBytes = Buffer.from(this._configuration.encryptionKey, 'hex');

        const cipher = crypto.createCipheriv('aes-256-gcm', encKeyBytes, ivBytes);

        const encryptedBytes = cipher.update(plaintext);
        const finalBytes = cipher.final();

        const versionBytes = Buffer.from(new Uint8Array([CURRENT_VERSION]));
        const ciphertextBytes = Buffer.concat([encryptedBytes, finalBytes]);
        const tagBytes = cipher.getAuthTag();

        const allBytes = Buffer.concat([versionBytes, ivBytes, ciphertextBytes, tagBytes]);
        return Base64Url.encode(allBytes);
    }

    /*
     * A helper method to decrypt a cookie using AES256-GCM and report errors clearly
     */
    public decryptCookie(cookieName: string, ciphertext: string): string {

        const allBytes = Base64Url.decode(ciphertext);

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

            const encKeyBytes = Buffer.from(this._configuration.encryptionKey, 'hex');
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
