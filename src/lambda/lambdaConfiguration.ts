import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';
import fs from 'fs-extra';
import {Configuration} from '../configuration/configuration';
import {ResponseWriter} from '../http/responseWriter';
import {LoggerFactory} from '../logging/loggerFactory';
import {AuthorizerMiddleware} from '../middleware/authorizerMiddleware';
import {CorsMiddleware} from '../middleware/corsMiddleware';
import {ExceptionMiddleware} from '../middleware/exceptionMiddleware';
import {LoggerMiddleware} from '../middleware/loggerMiddleware';
import {Container} from '../utilities/container';

/*
 * A shorthand type for this module
 */
type AsyncHandler = (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>;

/*
 * A class to configure the lambda and manage cross cutting concerns
 */
export class LambdaConfiguration {

    public enrichHandler(baseHandler: AsyncHandler, container: Container)
        : middy.MiddyfiedHandler<APIGatewayProxyEvent, APIGatewayProxyResult> | AsyncHandler {

        const loggerFactory = new LoggerFactory();
        try {
            // Load our JSON configuration
            const configuration = this._loadConfiguration();
            container.setConfiguration(configuration);
            loggerFactory.configure(configuration.logging);

            // Create middleware objects
            const loggerMiddleware = new LoggerMiddleware(container, loggerFactory);
            const exceptionMiddleware = new ExceptionMiddleware(container, loggerFactory);
            const authorizerMiddleware = new AuthorizerMiddleware(container, configuration);
            const corsMiddleware = new CorsMiddleware(configuration);

            // Wrap the base handler and add middleware for cross cutting concerns
            // This ordering ensures that correct CORS headers are written for error responses
            return middy(async (event: APIGatewayProxyEvent, context: Context) => {
                return baseHandler(event, context);

            })
                .use(loggerMiddleware)
                .use(exceptionMiddleware)
                .use(authorizerMiddleware)
                .use(corsMiddleware);

        } catch (e: any) {

            // Handle any startup exceptions
            return this._handleStartupError(loggerFactory, e);
        }
    }

    /*
     * Load the configuration JSON file
     */
    private _loadConfiguration(): Configuration {

        const configBuffer = fs.readFileSync('config.json');
        return JSON.parse(configBuffer.toString()) as Configuration;
    }

    /*
     * Ensure that any startup errors are logged and then return a handler that will provide the client response
     */
    private _handleStartupError(loggerFactory: LoggerFactory, error: any): AsyncHandler {

        const clientError = loggerFactory.logStartupError(error);
        return async () => {
            return ResponseWriter.objectResponse(500, clientError.toResponseFormat());
        };
    }
}