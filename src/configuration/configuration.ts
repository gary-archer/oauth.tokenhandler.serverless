import {CookieConfiguration} from './cookieConfiguration';
import {CorsConfiguration} from './corsConfiguration';
import {HostConfiguration} from './hostConfiguration';
import {LoggingConfiguration} from './loggingConfiguration';
import {OAuthAgentConfiguration} from './oauthAgentConfiguration';
import {RouteConfiguration} from './routeConfiguration';

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
