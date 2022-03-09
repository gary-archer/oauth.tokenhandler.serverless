/*
 * A holder for OAuth Agent API settings
 */
export interface OAuthAgentApiConfiguration {
    authorizeEndpoint: string;
    tokenEndpoint: string;
    endSessionEndpoint: string;
    provider: string
}
