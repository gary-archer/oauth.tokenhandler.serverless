import base64url from 'base64url';
import crypto from 'crypto';
import {GatewayConfiguration} from '../configuration/gatewayConfiguration';
import {GatewayErrorUtils} from '../errors/gatewayErrorUtils';

/*
 * A helper method to decrypt a cookie using AES256-GCM and report errors clearly
 */
export class CookieDecryptor {

    private readonly _configuration: GatewayConfiguration

    public constructor(configuration: GatewayConfiguration) {
        this._configuration = configuration;
    }

    public decrypt(cookieName: string, encryptedData: string): string {

        const VERSION_SIZE = 1;
        const GCM_IV_SIZE = 12;
        const GCM_TAG_SIZE = 16;
        const CURRENT_VERSION = 1;

        const allBytes = base64url.toBuffer(encryptedData);

        const minSize = VERSION_SIZE + GCM_IV_SIZE + 1 + GCM_TAG_SIZE;
        if (allBytes.length < minSize) {
            throw GatewayErrorUtils.fromMalformedCookieError(cookieName, 'The received cookie has an invalid length');
        }

        const version = allBytes[0];
        if (version != CURRENT_VERSION) {
            throw GatewayErrorUtils.fromMalformedCookieError(cookieName, 'The received cookie has an invalid format');
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

            throw GatewayErrorUtils.fromCookieDecryptionError(cookieName, e);
        }
    }
}
