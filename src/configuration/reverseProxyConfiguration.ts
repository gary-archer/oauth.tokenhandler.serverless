import {RouteConfiguration} from './routeConfiguration';

/*
 * A holder for reverse proxy configuration
 */
export interface ReverseProxyConfiguration {
    routes: RouteConfiguration[];
}
