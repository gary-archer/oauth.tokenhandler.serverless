import {OAuthAgentApiConfiguration} from './oauthAgentApiConfiguration.js';
import {OAuthAgentClientConfiguration} from './oauthAgentClientConfiguration.js';

/*
 * A holder for OAuth Agent settings
 */
export interface OAuthAgentConfiguration {
    api: OAuthAgentApiConfiguration;
    client: OAuthAgentClientConfiguration;
}
