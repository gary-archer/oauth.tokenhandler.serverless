import {APIGatewayProxyEvent} from 'aws-lambda';
import cookie, {CookieSerializeOptions} from 'cookie';
import {CookieConfiguration} from '../configuration/cookieConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {CookieEncrypter} from '../utilities/cookieEncrypter';
import {HeaderProcessor} from './headerProcessor';

const STATE_COOKIE   = 'state';
const ACCESS_COOKIE  = 'at';
const REFRESH_COOKIE = 'rt';
const ID_COOKIE      = 'id';
const CSRF_COOKIE    = 'csrf';

/*
 * A class to deal with cookie concerns
 */
export class CookieProcessor {

    private readonly _configuration: CookieConfiguration;

    public constructor(configuration: CookieConfiguration) {
        this._configuration = configuration;
    }

    /*
     * Write the state cookie object when a login starts
     */
    public writeStateCookie(data: any): string {

        const name = this._getCookieName(STATE_COOKIE);
        const value = CookieEncrypter.encryptCookie(name, JSON.stringify(data), this._configuration.encryptionKey);
        return cookie.serialize(name, value, this._getCookieOptions(STATE_COOKIE));
    }

    /*
     * Read the state cookie object when a login ends
     */
    public readStateCookie(event: APIGatewayProxyEvent): any {

        const name = this._getCookieName(STATE_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(name, event);
        if (ciphertext) {

            const serialized = CookieEncrypter.decryptCookie(name, ciphertext, this._configuration.encryptionKey);
            return JSON.parse(serialized);
        }

        return null;
    }

    /*
     * Write the refresh token cookie
     */
    public writeRefreshCookie(refreshToken: string): string {

        const name = this._getCookieName(REFRESH_COOKIE);
        const value = CookieEncrypter.encryptCookie(name, refreshToken, this._configuration.encryptionKey);
        return cookie.serialize(name, value, this._getCookieOptions(REFRESH_COOKIE));
    }

    /*
     * Read the refresh token from the cookie
     */
    public readRefreshCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(REFRESH_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(name, event);
        if (ciphertext) {
            return CookieEncrypter.decryptCookie(name, ciphertext, this._configuration.encryptionKey);
        }

        return null;
    }

    /*
     * Write the access token cookie
     */
    public writeAccessCookie(refreshToken: string): string {

        const name = this._getCookieName(ACCESS_COOKIE);
        const value = CookieEncrypter.encryptCookie(name, refreshToken, this._configuration.encryptionKey);
        return cookie.serialize(name, value, this._getCookieOptions(ACCESS_COOKIE));
    }

    /*
     * Read the access token from the cookie
     */
    public readAccessCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(ACCESS_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(name, event);
        if (ciphertext) {
            return CookieEncrypter.decryptCookie(name, ciphertext, this._configuration.encryptionKey);
        }

        return null;
    }

    /*
     * Write the ID token cookie
     */
    public writeIdCookie(refreshToken: string): string {

        const name = this._getCookieName(ID_COOKIE);
        const value = CookieEncrypter.encryptCookie(name, refreshToken, this._configuration.encryptionKey);
        return cookie.serialize(name, value, this._getCookieOptions(ID_COOKIE));
    }

    /*
     * Read the ID token from the cookie
     */
    public readIdCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(ID_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(name, event);
        if (ciphertext) {
            return CookieEncrypter.decryptCookie(name, ciphertext, this._configuration.encryptionKey);
        }

        return null;
    }

    /*
     * Write the anti forgery token cookie
     */
    public writeAntiForgeryCookie(csrfToken: string): string {

        const name = this._getCookieName(CSRF_COOKIE);
        const value = CookieEncrypter.encryptCookie(name, csrfToken, this._configuration.encryptionKey);
        return cookie.serialize(name, value, this._getCookieOptions(CSRF_COOKIE));
    }

    /*
     * Read the anti forgery value from the cookie
     */
    public readAntiForgeryCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(CSRF_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(name, event);
        if (ciphertext) {
            return CookieEncrypter.decryptCookie(name, ciphertext, this._configuration.encryptionKey);
        }

        return null;
    }

    /*
     * We also derive the request header value from this class
     */
    public getAntiForgeryRequestHeaderName(): string {

        const cookieName = this._getCookieName(CSRF_COOKIE);
        return `x-${cookieName}`;
    }

    /*
     * For data changing commands, enforce double sumbit cookie checks
     */
    public enforceAntiForgeryChecks(event: APIGatewayProxyEvent): void {

        const csrfCookie = this.readAntiForgeryCookie(event);
        if (!csrfCookie) {
            throw ErrorUtils.fromMissingCookieError(CSRF_COOKIE);
        }

        const csrfHeader = HeaderProcessor.readHeader(`x-${this._configuration.prefix}-${CSRF_COOKIE}`, event);
        if (!csrfHeader) {
            throw ErrorUtils.fromMissingAntiForgeryTokenError();
        }

        const csrfToken = CookieEncrypter.decryptCookie(CSRF_COOKIE, csrfCookie, this._configuration.encryptionKey);
        if (csrfHeader !== csrfToken) {
            throw ErrorUtils.fromMismatchedAntiForgeryTokenError();
        }
    }

    /*
     * Clear the temporary state cookie used during login
     */
    public expireStateCookie(): string {

        const name =this._getCookieName(STATE_COOKIE);
        return cookie.serialize(name, '', this._getExpireCookieOptions(STATE_COOKIE));
    }

    /*
     * Clear all cookies when the user session expires
     */
    public expireAllCookies(): string[] {

        return [
            cookie.serialize(this._getCookieName(REFRESH_COOKIE), '', this._getExpireCookieOptions(REFRESH_COOKIE)),
            cookie.serialize(this._getCookieName(ACCESS_COOKIE),  '', this._getExpireCookieOptions(ACCESS_COOKIE)),
            cookie.serialize(this._getCookieName(ID_COOKIE),      '', this._getExpireCookieOptions(ID_COOKIE)),
            cookie.serialize(this._getCookieName(CSRF_COOKIE),    '', this._getExpireCookieOptions(CSRF_COOKIE)),
        ];
    }

    /*
     * Return a cookie name from its type
     */
    private _getCookieName(type: string) {
        return `${this._configuration.prefix}-${type}`;
    }

    /*
     * All cookies use largely identical options
     */
    private _getCookieOptions(type: string): CookieSerializeOptions {

        return {

            // The cookie cannot be read by Javascript code
            httpOnly: true,

            // The cookie should be sent over an HTTPS connection
            secure: true,

            // The cookie written is only needed by the API domain
            domain: this._configuration.domain,

            // The refresh cookie is restricted to the refresh endpoint
            path: (type === REFRESH_COOKIE) ? '/refresh' : '/',

            // Other domains cannot send the cookie, which reduces cross site request forgery risks
            sameSite: 'strict',
        };
    }

    /*
     * Get options when expiring a cookie
     */
    private _getExpireCookieOptions(type: string): CookieSerializeOptions {

        const options = this._getCookieOptions(type);
        options.expires = new Date(0);
        return options;
    }
}