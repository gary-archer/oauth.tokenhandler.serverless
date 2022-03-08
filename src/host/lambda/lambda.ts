import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import { ResponseWriter } from '../../plumbing/utilities/responseWriter';
import {Container} from '../startup/container';
import {LambdaConfiguration} from '../startup/lambdaConfiguration';
import {JsonRouter} from './jsonRouter';

/*
 * A wildcard lambda to act as a reverse proxy
 */
const container = new Container();
const baseHandler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Return immediately for pre-flight OPTIONS requests
    if (event.httpMethod.toLowerCase() === 'options') {
        return ResponseWriter.objectResponse(204, null);
    }

    // Try to route the incoming HTTP request to the target API
    const router = new JsonRouter(container.getConfiguration());
    const response = await router.route(event, container.getAccessToken());

    // Return the API success or error response
    return ResponseWriter.objectResponse(response.status, response.data);
};

// Create an enriched handler, which wires up middleware for cross cutting concerns
const configuration = new LambdaConfiguration();
const handler = configuration.enrichHandler(baseHandler, container);

// Export the handler to serverless.yml
export {handler};
