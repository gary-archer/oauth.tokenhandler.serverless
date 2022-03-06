import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {JsonRouter} from '../routing/jsonRouter';
import {Container} from '../startup/container';
import {LambdaConfiguration} from '../startup/lambdaConfiguration';

/*
 * A simple generic reverse proxy handler
 */
const container = new Container();
const baseHandler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Avoid doing any real works for pre-flight OPTIONS requests
    if (event.httpMethod.toUpperCase() === 'OPTIONS') {
        return {
            statusCode: 204,
        } as APIGatewayProxyResult;
    }
    
    // Try to route the incoming HTTP request to the target API
    const router = new JsonRouter(container.getConfiguration());
    const response = await router.route(event);

    // Return the API success or error response
    return {
        statusCode: response.status,
        body: response.data,
    };
};

// Create an enriched handler, which wires up middleware for cross cutting concerns
const configuration = new LambdaConfiguration();
const handler = configuration.enrichHandler(baseHandler, container);

// Export the handler to serverless.yml
export {handler};
