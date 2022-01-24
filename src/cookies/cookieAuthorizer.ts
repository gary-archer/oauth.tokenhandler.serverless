import {APIGatewayRequestAuthorizerEvent} from 'aws-lambda';
import cookie from 'cookie';
import {GatewayConfiguration} from '../configuration/gatewayConfiguration';
import {GatewayErrorUtils} from '../errors/gatewayErrorUtils';
import {CookieDecryptor} from './cookieDecryptor';

/*
 * A class to do the main work of cookie authorization in the lambda authorizer
 */
export class CookieAuthorizer {

    private readonly _configuration: GatewayConfiguration;
    private readonly _decryptor: CookieDecryptor;

    public constructor(configuration: GatewayConfiguration) {
        this._configuration = configuration;
        this._decryptor = new CookieDecryptor(configuration);
    }

    /*
     * Verify cookies, enforce CSRF if required, then return an access token on success
     */
    public execute(event: APIGatewayRequestAuthorizerEvent): string {

        this._verifyOrigin(event);

        const method = event.httpMethod.toLowerCase();
        if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
            this._enforceCsrfChecks(event);
        }

        const name = 'at';
        const accessCookie = this._readCookie(name, event);
        if (!accessCookie) {
            throw GatewayErrorUtils.fromMissingCookieError(name);
        }

        return this._decryptor.decrypt(name, accessCookie);
    }

    /*
     * Reject any calls whose origin header (sent by all modern browsers) is not trusted
     */
    private _verifyOrigin(event: APIGatewayRequestAuthorizerEvent): void {

        const origin = this._readHeader('origin', event);
        if (!origin) {
            throw GatewayErrorUtils.fromMissingOriginError();
        }

        const trusted = this._configuration.trustedOrigins.find(o => o === origin);
        if (!trusted) {
            throw GatewayErrorUtils.fromUntrustedOriginError();
        }
    }

    /*
     * Enforce OWASP best practice checks for data changing commands
     */
    private _enforceCsrfChecks(event: APIGatewayRequestAuthorizerEvent): void {

        const name = 'csrf';
        const csrfCookie = this._readCookie(name, event);
        if (!csrfCookie) {
            throw GatewayErrorUtils.fromMissingCookieError(name);
        }

        const csrfHeader = this._readHeader(`x-${this._configuration.cookiePrefix}-${name}`, event);
        if (!csrfHeader) {
            throw GatewayErrorUtils.fromMissingAntiForgeryTokenError();
        }

        const csrfToken =this._decryptor.decrypt(name, csrfCookie);
        if (csrfHeader !== csrfToken) {
            throw GatewayErrorUtils.fromMismatchedAntiForgeryTokenError();
        }
    }

    /*
     * Try to read a field from the cookie header
     */
    private _readCookie(name: string, event: APIGatewayRequestAuthorizerEvent): string | null {

        const cookieName = `${this._configuration.cookiePrefix}-${name}`;

        let result = null;
        const headers = this._readMultiValueHeader('cookie', event);
        headers.forEach((h) => {

            const data = cookie.parse(h);
            if (data[cookieName]) {
                result = data[cookieName];
            }
        });

        return result;
    }

    /*
     * Read a single value header value
     */
    private _readHeader(name: string, event: APIGatewayRequestAuthorizerEvent): string | null {

        if (event.headers) {

            const found = Object.keys(event.headers).find((h) => h.toLowerCase() === name);
            if (found) {
                return event.headers[found] as string;
            }
        }

        return null;
    }

    /*
     * Read a multi value header, which is how cookies are received
     */
    private _readMultiValueHeader(name: string, event: APIGatewayRequestAuthorizerEvent): string[] {

        if (event.multiValueHeaders) {

            const found = Object.keys(event.multiValueHeaders).find((h) => h.toLowerCase() === name);
            if (found) {
                return event.multiValueHeaders[found] as string[];
            }
        }

        return [];
    }
}
