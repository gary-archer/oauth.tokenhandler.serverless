import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {ResponseWriter} from '../http/responseWriter';
import {Container} from '../utilities/container';
import {LambdaConfiguration} from './lambdaConfiguration';

/*
 * A wildcard lambda through which the SPA calls APIs and the Authorization Server
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
