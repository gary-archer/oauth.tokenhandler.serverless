import {APIGatewayProxyEvent} from 'aws-lambda';
import cookie, {CookieSerializeOptions} from 'cookie';
import {CookieConfiguration} from '../configuration/cookieConfiguration.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {CookieEncrypter} from '../utilities/cookieEncrypter.js';
import {HeaderProcessor} from './headerProcessor.js';

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
    private readonly _encrypter: CookieEncrypter;

    public constructor(configuration: CookieConfiguration) {

        this._configuration = configuration;
        this._encrypter = new CookieEncrypter(configuration);
    }

    /*
     * Write the state cookie object when a login starts
     */
    public writeStateCookie(data: any): string {

        const name = this._getCookieName(STATE_COOKIE);
        const value = this._encrypter.encryptCookie(JSON.stringify(data));
        return cookie.serialize(name, value, this._getCookieOptions(STATE_COOKIE));
    }

    /*
     * Read the state cookie object when a login ends
     */
    public readStateCookie(event: APIGatewayProxyEvent): any {

        const name = this._getCookieName(STATE_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {

            const serialized = this._encrypter.decryptCookie(name, ciphertext);
            return JSON.parse(serialized);
        }

        return null;
    }

    /*
     * Write the refresh token cookie
     */
    public writeRefreshCookie(refreshToken: string): string {

        const name = this._getCookieName(REFRESH_COOKIE);
        const value = this._encrypter.encryptCookie(refreshToken);
        return cookie.serialize(name, value, this._getCookieOptions(REFRESH_COOKIE));
    }

    /*
     * Read the refresh token from the cookie
     */
    public readRefreshCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(REFRESH_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this._encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * Write the access token cookie
     */
    public writeAccessCookie(refreshToken: string): string {

        const name = this._getCookieName(ACCESS_COOKIE);
        const value = this._encrypter.encryptCookie(refreshToken);
        return cookie.serialize(name, value, this._getCookieOptions(ACCESS_COOKIE));
    }

    /*
     * Read the access token from the cookie
     */
    public readAccessCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(ACCESS_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this._encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * Write the ID token cookie
     */
    public writeIdCookie(refreshToken: string): string {

        const name = this._getCookieName(ID_COOKIE);
        const value = this._encrypter.encryptCookie(refreshToken);
        return cookie.serialize(name, value, this._getCookieOptions(ID_COOKIE));
    }

    /*
     * Read the ID token from the cookie
     */
    public readIdCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(ID_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this._encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * Write the CSRF token cookie
     */
    public writeCsrfTokenCookie(csrfToken: string): string {

        const name = this._getCookieName(CSRF_COOKIE);
        const value = this._encrypter.encryptCookie(csrfToken);
        return cookie.serialize(name, value, this._getCookieOptions(CSRF_COOKIE));
    }

    /*
     * Read the CSRF token value from the cookie
     */
    public readCsrfTokenCookie(event: APIGatewayProxyEvent): string | null {

        const name = this._getCookieName(CSRF_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this._encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * We also derive the request header value from this class
     */
    public getCsrfTokenRequestHeaderName(): string {

        const cookieName = this._getCookieName(CSRF_COOKIE);
        return `x-${cookieName}`;
    }

    /*
     * For data changing commands, enforce double sumbit cookie checks
     */
    public enforceCsrfTokenChecks(event: APIGatewayProxyEvent): void {

        const csrfCookie = this.readCsrfTokenCookie(event);
        if (!csrfCookie) {
            throw ErrorUtils.fromMissingCookieError(CSRF_COOKIE);
        }

        const csrfHeader = HeaderProcessor.readHeader(event, `x-${this._configuration.prefix}-${CSRF_COOKIE}`);
        if (!csrfHeader) {
            throw ErrorUtils.fromMissingCsrfTokenError();
        }

        const csrfToken = this._encrypter.decryptCookie(CSRF_COOKIE, csrfCookie);
        if (csrfHeader !== csrfToken) {
            throw ErrorUtils.fromMismatchedCsrfTokenError();
        }
    }

    /*
     * Clear the temporary state cookie used during login
     */
    public expireStateCookie(): string {
        return cookie.serialize(this._getCookieName(STATE_COOKIE), '', this._getExpireCookieOptions(STATE_COOKIE));
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

            // Set the cookie path
            path: this._getCookiePath(type),

            // Other domains cannot send the cookie
            sameSite: 'strict',
        };
    }

    /*
     * Calculate the path, depending on the type of cookie
     */
    private _getCookiePath(type: string): string {

        if (type === STATE_COOKIE) {

            // The state cookie is restricted to login paths
            return '/tokenhandler/oauth-agent/login';

        } else if (type === REFRESH_COOKIE) {

            // The refresh cookie is restricted to the refresh path
            return '/tokenhandler/oauth-agent/refresh';

        } else if (type === ID_COOKIE) {

            // The ID cookie is restricted to the claims path
            return '/tokenhandler/oauth-agent/claims';

        } else {

            // The base path is used for APIs, and requires the access token cookie and the CSRF cookie
            return '/';
        }
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