/*
 * A holder for OAuth Agent client settings
 */
export interface OAuthAgentClientConfiguration {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    postLogoutRedirectUri: string
    scope: string
}
