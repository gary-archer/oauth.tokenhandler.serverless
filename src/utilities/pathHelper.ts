import {APIGatewayProxyEvent} from 'aws-lambda';

/*
 * A utility to deal with paths and query parameters
 */
export class PathHelper {

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
