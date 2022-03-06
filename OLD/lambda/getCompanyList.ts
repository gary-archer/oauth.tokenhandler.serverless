import fs from 'fs-extra';
import {APIGatewayProxyResult, APIGatewayRequestAuthorizerEvent, CustomAuthorizerResult} from 'aws-lambda';
import {GatewayConfiguration} from '../configuration/gatewayConfiguration';
import {CookieAuthorizer} from '../cookies/cookieAuthorizer';
import {PolicyDocumentWriter} from '../cookies/policyDocumentWriter';
import {GatewayErrorUtils} from '../errors/gatewayErrorUtils';

/*
 * Our handler just returns the AWS response document produced by cookie middleware
 */
const handler = async (event: APIGatewayRequestAuthorizerEvent)
    : Promise<CustomAuthorizerResult | APIGatewayProxyResult> => {

    try {
        // Load configuration for the gateway
        const configBuffer = await fs.readFile('config.json');
        const configuration = JSON.parse(configBuffer.toString()) as GatewayConfiguration;

        // Run the logic to check cookies, which will return an access token on success
        const authorizer = new CookieAuthorizer(configuration);
        const accessToken = authorizer.execute(event);

        // Next run the AWS specific logic to get an access token
        return PolicyDocumentWriter.authorizedResponse(accessToken, event);

    } catch (e: any) {

        const error = GatewayErrorUtils.fromException(e);

        // To return a 401 to the caller we must return an unauthorized policy document
        if (error.statusCode === 401) {
            return PolicyDocumentWriter.unauthorizedResponse(event);
        }

        // Otherwise return a 500 response
        return {
            statusCode: 500,
            body: JSON.stringify(error.toResponseFormat()),
        };
    }
};

// Export the handler to serverless.yml
export {handler};