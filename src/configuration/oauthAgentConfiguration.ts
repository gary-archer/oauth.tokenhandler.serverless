import {OAuthAgentApiConfiguration} from './oauthAgentApiConfiguration';
import {OAuthAgentClientConfiguration} from './oauthAgentClientConfiguration';

/*
 * A holder for OAuth Agent settings
 */
export interface OAuthAgentConfiguration {
    api: OAuthAgentApiConfiguration;
    client: OAuthAgentClientConfiguration;
}
