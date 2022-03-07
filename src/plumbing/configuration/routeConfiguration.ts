import {CorsConfiguration} from './corsConfiguration';
import {OAuthProxyConfiguration} from './oauthProxyConfiguration';

/*
 * Configuration for a single route
 */
export interface RouteConfiguration {
    name: string;
    path: string;
    target: string;
    cors: CorsConfiguration | null;
    oauthProxy: OAuthProxyConfiguration | null;
}
