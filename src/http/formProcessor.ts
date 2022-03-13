import {APIGatewayProxyEvent} from 'aws-lambda';

/*
 * A utility to read form data
 */
export class FormProcessor {

    public static readJsonField(event: APIGatewayProxyEvent, name: string): string | null {

        const body = event.body ? JSON.parse(event.body) : {};

        const value = body[name];
        if (value) {
            return value;
        }

        return null;
    }
}
