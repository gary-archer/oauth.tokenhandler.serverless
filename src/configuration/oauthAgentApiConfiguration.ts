/*
 * A holder for OAuth Agent API settings
 */
export interface OAuthAgentApiConfiguration {
    issuer: string;
    authorizeEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    endSessionEndpoint: string;
    jwksEndpoint: string;
    idTokenAlgorithm: string;
    provider: string
}
