import {CookieConfiguration} from './cookieConfiguration.js';
import {CorsConfiguration} from './corsConfiguration.js';
import {HostConfiguration} from './hostConfiguration.js';
import {LoggingConfiguration} from './loggingConfiguration.js';
import {OAuthAgentConfiguration} from './oauthAgentConfiguration.js';
import {RouteConfiguration} from './routeConfiguration.js';

/*
 * The overall configuration
 */
export interface Configuration {
    host: HostConfiguration;
    logging: LoggingConfiguration;
    cors: CorsConfiguration;
    cookie: CookieConfiguration;
    oauthAgent: OAuthAgentConfiguration;
    routes: RouteConfiguration[];
}
