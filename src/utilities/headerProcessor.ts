import {APIGatewayProxyEvent} from 'aws-lambda';

/*
 * A utility to deal with lambda header formats
 */
export class HeaderProcessor {

    /*
     * Read a single value header
     */
    public static readHeader(name: string, event: APIGatewayProxyEvent): string | null {

        if (event.headers) {

            const found = Object.keys(event.headers).find((h) => h.toLowerCase() === name);
            if (found) {
                return event.headers[found] as string;
            }
        }

        return null;
    }

    /*
     * Read a multi value header, which is how cookies are received
     */
    public static readMultiValueHeader(name: string, event: APIGatewayProxyEvent): string[] {

        if (event.multiValueHeaders) {

            const found = Object.keys(event.multiValueHeaders).find((h) => h.toLowerCase() === name);
            if (found) {
                return event.multiValueHeaders[found] as string[];
            }
        }

        return [];
    }
}
