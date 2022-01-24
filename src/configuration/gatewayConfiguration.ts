/*
 * A holder for API gateway configuration settings for the cookie authorizer
 */
export interface GatewayConfiguration {
    trustedOrigins: string[];
    cookiePrefix: string;
    cookieDecryptionKey: string;
}
