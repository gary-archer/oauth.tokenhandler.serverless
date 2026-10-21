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

        this.state = this.getBytes().toString('base64url');

        const verifierBytes = this.getBytes();
        this.codeVerifier = verifierBytes.toString('base64url');
        this.codeChallenge = this.sha256(this.codeVerifier).toString('base64url');
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
    private sha256(input: string): Buffer {
        return createHash('sha256').update(input).digest();
    }
}
