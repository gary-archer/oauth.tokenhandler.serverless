import {RouteConfiguration} from '../../plumbing/configuration/routeConfiguration';
import {ApiConfiguration} from './apiConfiguration';

/*
 * A holder for reverse proxy configuration
 */
export interface Configuration {
    api: ApiConfiguration;
    routes: RouteConfiguration[];
}
