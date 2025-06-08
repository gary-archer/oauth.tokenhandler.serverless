import {createHash, randomBytes} from 'crypto';

/*
 * Deal with OAuth state and PKCE values
 */
export class OAuthLoginState {

    private state: string;
    private codeVerifier: string;
    private codeChallenge: string;

    /*
     * Generate the login state when constructed
     */
    public constructor() {

        const verifierBytes = this.getBytes();
        this.state = this.base64UrlEncode(this.getBytes());
        this.codeVerifier = this.base64UrlEncode(verifierBytes);
        this.codeChallenge = this.base64UrlEncode(this.sha256(this.codeVerifier));
    }

    public getState(): string {
        return this.state;
    }

    public getCodeVerifier(): string {
        return this.codeVerifier;
    }

    public getCodeChallenge(): string {
        return this.codeChallenge;
    }

    /*
     * Return random bytes
     */
    private getBytes(): Buffer {
        return randomBytes(32);
    }

    /*
     * Convert a previously generated buffer to a string
     */
    private base64UrlEncode(buffer: Buffer): string {

        return buffer.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /*
     * Convert a previously generated buffer to a string
     */
    private sha256(input: string): Buffer {
        return createHash('sha256').update(input).digest();
    }
}
