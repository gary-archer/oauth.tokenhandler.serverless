import {RouteConfiguration} from '../../plumbing/configuration/routeConfiguration';

/*
 * A holder for reverse proxy configuration
 */
export interface Configuration {
    routes: RouteConfiguration[];
}
