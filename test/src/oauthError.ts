/*
 * A simple error class
 */
export class OAuthError extends Error {

    public readonly status: number;
    public readonly code: string;

    public constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
