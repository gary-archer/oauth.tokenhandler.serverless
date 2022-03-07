import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {Container} from '../startup/container';
import {LambdaConfiguration} from '../startup/lambdaConfiguration';
import {ApiClient} from './apiClient';

/*
 * A wildcard lambda to act as a reverse proxy
 */
const container = new Container();
const baseHandler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Return immediately for pre-flight OPTIONS requests
    if (event.httpMethod.toUpperCase() === 'OPTIONS') {
        return {
            statusCode: 204,
        } as APIGatewayProxyResult;
    }

    // Try to route the incoming HTTP request to the target API
    const client = new ApiClient(container.getConfiguration());
    const response = await client.route(event);

    // Return the API success or error response
    const lambdaResult = {
        statusCode: response.status,
    } as APIGatewayProxyResult;

    if (event.httpMethod.toUpperCase() !== 'HEAD') {
        lambdaResult.body = response.data;
    }

    return lambdaResult;
};

// Create an enriched handler, which wires up middleware for cross cutting concerns
const configuration = new LambdaConfiguration();
const handler = configuration.enrichHandler(baseHandler, container);

// Export the handler to serverless.yml
export {handler};
