import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import fs from 'fs-extra';
import {ReverseProxyConfiguration} from '../configuration/reverseProxyConfiguration';
import {ClientError} from '../errors/clientError';
import {JsonRouter} from '../routing/jsonRouter';

/*
 * A simple generic reverse proxy handler
 */
const handler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Load configuration
    const configBuffer = await fs.readFile('config.json');
    const configuration = JSON.parse(configBuffer.toString()) as ReverseProxyConfiguration;

    try {

        // Try to route the incoming HTTP request to the target API
        const router = new JsonRouter(configuration);
        const response = await router.route(event);

        // Return the API response details
        return {
            statusCode: response.status,
            body: response.data,
        };

    } catch (e: any) {

        // Report errors
        if (e instanceof ClientError) {

            console.error(e.toLogFormat());
            return {
                statusCode: e.getStatusCode(),
                body: JSON.stringify(e.toResponseFormat()),
            };
        }

        console.error(e);
        return {
            statusCode: 500,
            body: JSON.stringify({
                code: 'server_error',
                message: 'Problem encountered in the reverse proxy',
            }),
        };
    }
};

// Export the handler to serverless.yml
export {handler};
