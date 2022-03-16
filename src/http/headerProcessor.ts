import {APIGatewayProxyEvent} from 'aws-lambda';
import cookie from 'cookie';

/*
 * A utility to deal with lambda header formats
 */
export class HeaderProcessor {

    /*
     * Read a single value header
     */
    public static readHeader(event: APIGatewayProxyEvent, name: string): string | null {

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
    public static readMultiValueHeader(event: APIGatewayProxyEvent, name: string): string[] {

        if (event.multiValueHeaders) {

            const found = Object.keys(event.multiValueHeaders).find((h) => h.toLowerCase() === name);
            if (found) {
                return event.multiValueHeaders[found] as string[];
            }
        }

        return [];
    }

    /*
     * Parse the parts of the cookie from a multi value header
     */
    public static readCookieValue(event: APIGatewayProxyEvent, name: string): string | null {

        let result = '';
        const headers = HeaderProcessor.readMultiValueHeader(event, 'cookie');
        headers.forEach((h) => {

            const data = cookie.parse(h);
            if (data[name]) {
                result = data[name];
            }
        });

        return result;
    }
}
