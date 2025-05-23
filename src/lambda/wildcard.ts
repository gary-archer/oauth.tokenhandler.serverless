import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {ResponseWriter} from '../http/responseWriter.js';
import {Container} from '../utilities/container.js';
import {LambdaConfiguration} from './lambdaConfiguration.js';

/*
 * A wildcard lambda through which the SPA calls APIs and the authorization server
 */
const container = new Container();
const baseHandler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Return immediately for pre-flight OPTIONS requests
    if (event.httpMethod.toLowerCase() === 'options') {
        return ResponseWriter.objectResponse(204, null);
    }

    // Otherwise return the response that middleware wrote to the container
    return container.getResponse();
};

// Create an enriched handler, which wires up middleware for cross cutting concerns
const configuration = new LambdaConfiguration();
const handler = configuration.enrichHandler(baseHandler, container);

// Export the handler to serverless.yml
export {handler};
