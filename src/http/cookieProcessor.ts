import {APIGatewayProxyEvent} from 'aws-lambda';
import cookie, {SerializeOptions} from 'cookie';
import {CookieConfiguration} from '../configuration/cookieConfiguration.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {CookieEncrypter} from '../utilities/cookieEncrypter.js';
import {HeaderProcessor} from './headerProcessor.js';

const STATE_COOKIE   = 'state';
const ACCESS_COOKIE  = 'at';
const REFRESH_COOKIE = 'rt';
const ID_COOKIE      = 'id';

/*
 * A class to deal with cookie concerns
 */
export class CookieProcessor {

    private readonly configuration: CookieConfiguration;
    private readonly encrypter: CookieEncrypter;

    public constructor(configuration: CookieConfiguration) {

        this.configuration = configuration;
        this.encrypter = new CookieEncrypter(configuration);
    }

    /*
     * Write the state cookie object when a login starts
     */
    public writeStateCookie(data: any): string {

        const name = this.getCookieName(STATE_COOKIE);
        const value = this.encrypter.encryptCookie(JSON.stringify(data));
        return cookie.serialize(name, value, this.getCookieOptions(STATE_COOKIE));
    }

    /*
     * Read the state cookie object when a login ends
     */
    public readStateCookie(event: APIGatewayProxyEvent): any {

        const name = this.getCookieName(STATE_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {

            const serialized = this.encrypter.decryptCookie(name, ciphertext);
            return JSON.parse(serialized);
        }

        return null;
    }

    /*
     * Write the refresh token cookie
     */
    public writeRefreshCookie(refreshToken: string): string {

        const name = this.getCookieName(REFRESH_COOKIE);
        const value = this.encrypter.encryptCookie(refreshToken);
        return cookie.serialize(name, value, this.getCookieOptions(REFRESH_COOKIE));
    }

    /*
     * Read the refresh token from the cookie
     */
    public readRefreshCookie(event: APIGatewayProxyEvent): string | null {

        const name = this.getCookieName(REFRESH_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this.encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * Write the access token cookie
     */
    public writeAccessCookie(accessToken: string): string {

        const name = this.getCookieName(ACCESS_COOKIE);
        const value = this.encrypter.encryptCookie(accessToken);
        return cookie.serialize(name, value, this.getCookieOptions(ACCESS_COOKIE));
    }

    /*
     * Read the access token from the cookie
     */
    public readAccessCookie(event: APIGatewayProxyEvent): string | null {

        const name = this.getCookieName(ACCESS_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this.encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * Write the ID token cookie
     */
    public writeIdCookie(idToken: string): string {

        const parts = idToken.split('.');
        if (parts.length !== 3) {
            throw ErrorUtils.createInvalidOAuthResponseError('An invalid ID token was received');

        }

        const name = this.getCookieName(ID_COOKIE);
        const value = this.encrypter.encryptCookie(parts[1]);
        return cookie.serialize(name, value, this.getCookieOptions(ID_COOKIE));
    }

    /*
     * Read the ID token from the cookie
     */
    public readIdCookie(event: APIGatewayProxyEvent): string | null {

        const name = this.getCookieName(ID_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        if (ciphertext) {
            return this.encrypter.decryptCookie(name, ciphertext);
        }

        return null;
    }

    /*
     * Get the cookie without reading it to detect whether logged in
     */
    public isLoggedIn(event: APIGatewayProxyEvent): boolean {
        const name = this.getCookieName(ID_COOKIE);
        const ciphertext = HeaderProcessor.readCookieValue(event, name);
        return !!ciphertext;
    }

    /*
     * Clear the temporary state cookie used during login
     */
    public expireStateCookie(): string {
        return cookie.serialize(this.getCookieName(STATE_COOKIE), '', this.getExpireCookieOptions(STATE_COOKIE));
    }

    /*
     * Clear all cookies when the user session expires
     */
    public expireAllCookies(): string[] {

        return [
            cookie.serialize(this.getCookieName(REFRESH_COOKIE), '', this.getExpireCookieOptions(REFRESH_COOKIE)),
            cookie.serialize(this.getCookieName(ACCESS_COOKIE),  '', this.getExpireCookieOptions(ACCESS_COOKIE)),
            cookie.serialize(this.getCookieName(ID_COOKIE),      '', this.getExpireCookieOptions(ID_COOKIE)),
        ];
    }

    /*
     * Return a cookie name from its type
     */
    private getCookieName(type: string) {
        return `${this.configuration.prefix}-${type}`;
    }

    /*
     * All cookies use largely identical options
     */
    private getCookieOptions(type: string): SerializeOptions {

        return {

            // The cookie cannot be read by Javascript code
            httpOnly: true,

            // The cookie should be sent over an HTTPS connection
            secure: true,

            // Set the cookie path
            path: this.getCookiePath(type),

            // Other domains cannot send the cookie
            sameSite: 'strict',
        };
    }

    /*
     * Calculate the path, depending on the type of cookie
     */
    private getCookiePath(type: string): string {

        if (type === STATE_COOKIE) {

            // The state cookie is restricted to login paths
            return '/oauth-agent/login';

        } else if (type === REFRESH_COOKIE) {

            // The refresh cookie is restricted to the refresh path
            return '/oauth-agent/refresh';

        } else if (type === ID_COOKIE) {

            // The ID cookie is used by the OAuth Agent to indicate that the user is logged in
            return '/oauth-agent';

        } else {

            // The base path is used for APIs, and requires the access token cookie
            return '/';
        }
    }

    /*
     * Get options when expiring a cookie
     */
    private getExpireCookieOptions(type: string): SerializeOptions {

        const options = this.getCookieOptions(type);
        options.expires = new Date(0);
        return options;
    }
}