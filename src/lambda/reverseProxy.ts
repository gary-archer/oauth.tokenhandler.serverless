import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import fs from 'fs-extra';
import {ReverseProxyConfiguration} from '../configuration/reverseProxyConfiguration';
import {ClientError} from '../errors/clientError';
import {Router} from '../routing/router';

/*
 * A simple generic reverse proxy handler
 */
const handler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Load configuration
    const configBuffer = await fs.readFile('config.json');
    const configuration = JSON.parse(configBuffer.toString()) as ReverseProxyConfiguration;

    try {

        // Find the route for the incoming HTTP request
        const router = new Router(configuration);
        const route = router.findRoute(event);

        // Forward to the target API
        const response = await router.forward(event, route);

        // Return the API response details
        return {
            statusCode: response.status,
            body: JSON.stringify(response.data),
            headers: response.headers,
        };

    } catch (e: any) {

        // Report errors
        if (e instanceof ClientError) {

            return {
                statusCode: e.getStatusCode(),
                body: JSON.stringify(e.toResponseFormat()),
            };
        }

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
