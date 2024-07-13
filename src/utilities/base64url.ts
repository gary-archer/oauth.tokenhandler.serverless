/*
 * A base64url utility
 */
export class Base64Url {

    /*
     * This is primarily used to encode encrypted bytes to base64url ciphertext
     */
    public static encode(input: Buffer): string {

        return input.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    /*
     * This is primarily used to decode base64url ciphertext to encrypted bytes
     */
    public static decode(input: string): Buffer {

        const base64 = input
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        return Buffer.from(base64, 'base64');
    }

    /*
     * This is primarily used to decode a JWT payload to a JSON string
     */
    public static decodeToString(input: string): string {
        return Base64Url.decode(input).toString();
    }
}
