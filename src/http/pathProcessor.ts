import {APIGatewayProxyEvent} from 'aws-lambda';
import {RouteConfiguration} from '../configuration/routeConfiguration';

/*
 * A utility to deal with paths
 */
export class PathProcessor {

    /*
     * Try to find a reverse proxy route for the current path
     */
    public static findRoute(event: APIGatewayProxyEvent, routes: RouteConfiguration[]): RouteConfiguration | undefined {

        return routes.find(r => event.path.toLowerCase().startsWith(r.path.toLowerCase()));
    }

    /*
     * Get the full request path, including query parameters
     */
    public static getFullPath(event: APIGatewayProxyEvent): string {

        let path = '';
        if (event.path) {
            path = event.path;
            if (event.queryStringParameters) {

                // Collect each item
                const items = [];
                for (const key in event.queryStringParameters) {
                    if (key) {
                        items.push(`${key}=${event.queryStringParameters[key]}`);
                    }
                }

                // Append to the base path
                if (items.length > 0) {
                    path += `?${items.join('&')}`;
                }
            }
        }

        return path;
    }
}
