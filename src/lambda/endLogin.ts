import {APIGatewayProxyEvent, APIGatewayProxyResult} from 'aws-lambda';
import {ResponseWriter} from '../http/responseWriter';
import {OAuthAgent} from '../oauth-agent/oauthAgent';
import {LambdaInstance} from '../startup/lambdaInstance';
import {Container} from '../utilities/container';

/*
 * The end login lambda, to process the authorization response, get tokens and set cookies
 */
const container = new Container();
const baseHandler = async (event: APIGatewayProxyEvent) : Promise<APIGatewayProxyResult> => {

    // Return immediately for pre-flight OPTIONS requests
    if (event.httpMethod.toLowerCase() === 'options') {
        return ResponseWriter.objectResponse(204, null);
    }

    // Otherwise, run the OAuth agent logic
    const configuration = container.getConfiguration();
    const oauthAgent = new OAuthAgent(container, configuration.oauthAgent, configuration.cookie);
    return await oauthAgent.endLogin(event);
};

// Prepare the lambda instance, which is used for multiple HTTP requests, with cross cutting concerns
const instance = new LambdaInstance();
const handler = instance.prepare(baseHandler, container);
export {handler};
