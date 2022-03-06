import {OAuthProxyConfiguration} from './oauthProxyConfiguration';

/*
 * Configuration for a single route
 */
export interface RouteConfiguration {
    name: string;
    path: string;
    target: string;
    oauthProxy: OAuthProxyConfiguration | null;
}
