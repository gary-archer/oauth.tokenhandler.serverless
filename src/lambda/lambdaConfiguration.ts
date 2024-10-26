import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';
import fs from 'fs-extra';
import {Configuration} from '../configuration/configuration.js';
import {ResponseWriter} from '../http/responseWriter.js';
import {LoggerFactory} from '../logging/loggerFactory.js';
import {AuthorizerMiddleware} from '../middleware/authorizerMiddleware.js';
import {CorsMiddleware} from '../middleware/corsMiddleware.js';
import {ExceptionMiddleware} from '../middleware/exceptionMiddleware.js';
import {LoggerMiddleware} from '../middleware/loggerMiddleware.js';
import {Container} from '../utilities/container.js';

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
            const configuration = this.loadConfiguration();
            container.setConfiguration(configuration);
            loggerFactory.configure(configuration.logging);

            // Create middleware objects
            const loggerMiddleware = new LoggerMiddleware(container, loggerFactory);
            const exceptionMiddleware = new ExceptionMiddleware(container, loggerFactory);
            const authorizerMiddleware = new AuthorizerMiddleware(container);
            const corsMiddleware = new CorsMiddleware(configuration);

            // Wrap the base handler and add middleware for cross cutting concerns
            return middy(async (event: APIGatewayProxyEvent, context: Context) => {
                return baseHandler(event, context);

            })
                // Handlers run in the reverse order listed here, so that CORS headers are added to the response
                .use(corsMiddleware)
                .use(loggerMiddleware)
                .use(exceptionMiddleware)
                .use(authorizerMiddleware);

        } catch (e: any) {

            // Handle any startup exceptions
            return this.handleStartupError(loggerFactory, e);
        }
    }

    /*
     * Load the configuration JSON file
     */
    private loadConfiguration(): Configuration {

        const configBuffer = fs.readFileSync('config.json');
        return JSON.parse(configBuffer.toString()) as Configuration;
    }

    /*
     * Ensure that any startup errors are logged and then return a handler that will provide the client response
     */
    private handleStartupError(loggerFactory: LoggerFactory, error: any): AsyncHandler {

        const clientError = loggerFactory.logStartupError(error);
        return async () => {
            return ResponseWriter.objectResponse(500, clientError.toResponseFormat());
        };
    }
}