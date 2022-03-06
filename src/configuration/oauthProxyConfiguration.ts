/*
 * OAuth proxy configuration for a route
 */
export interface OAuthProxyConfiguration {
    cookiePrefix: string;
    cookieDecryptionKey: string;
    trustedWebOrigins: string[];
}
