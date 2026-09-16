import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {ResponseWriter} from '../http/responseWriter';
import {Container} from '../utilities/container';
import {LambdaInstance} from '../startup/lambdaInstance';

/*
 * The start login lambda, to provide parameters for an authorization redirect
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

// Prepare the lambda instance, which is used for multiple HTTP requests, with cross cutting concerns
const instance = new LambdaInstance();
const handler = instance.prepare(baseHandler, container);
export {handler};
