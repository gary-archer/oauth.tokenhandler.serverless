import middy from '@middy/core';
import {APIGatewayProxyResult, Context} from 'aws-lambda';
import fs from 'fs';
import {Configuration} from '../configuration/configuration';
import {ResponseWriter} from '../http/responseWriter';
import {LoggerFactory} from '../logging/loggerFactory';
import {CorsMiddleware} from '../middleware/corsMiddleware';
import {ExceptionMiddleware} from '../middleware/exceptionMiddleware';
import {LoggerMiddleware} from '../middleware/loggerMiddleware';
import {APIGatewayProxyExtendedEvent} from '../utilities/apiGatewayProxyExtendedEvent';

/*
 * A shorthand type for this module
 */
type AsyncHandler = (event: APIGatewayProxyExtendedEvent, context: Context) => Promise<APIGatewayProxyResult>;

/*
 * Each instance of the lambda receives multiple HTTP requests
 */
export class LambdaInstance {

    private configuration: Configuration | null = null;

    /*
     * Enrich the base handler with middleware to manage cross cutting concerns
     */
    public prepare(baseHandler: AsyncHandler)
        : middy.MiddyfiedHandler<APIGatewayProxyExtendedEvent, APIGatewayProxyResult> | AsyncHandler {

        const loggerFactory = new LoggerFactory();
        try {

            // Load the JSON configuration and configure logging
            const configJson = fs.readFileSync('config.json', 'utf8');
            this.configuration = JSON.parse(configJson) as Configuration;
            loggerFactory.configure(this.configuration.logging);

            // Create middleware objects
            const loggerMiddleware = new LoggerMiddleware(loggerFactory);
            const exceptionMiddleware = new ExceptionMiddleware(this.configuration, loggerFactory);
            const corsMiddleware = new CorsMiddleware(this.configuration);

            // Wrap the base handler and add middleware for cross cutting concerns
            return middy(async (event: APIGatewayProxyExtendedEvent, context: Context) => {
                return baseHandler(event, context);

            })
                // Handlers run in the reverse order listed here, so that CORS headers are added to the response
                .use(corsMiddleware)
                .use(loggerMiddleware)
                .use(exceptionMiddleware);

        } catch (e: any) {

            // Handle any startup exceptions
            return this.handleStartupError(loggerFactory, e);
        }
    }

    /*
     * Return the configuration to lambda code
     */
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    public getConfiguration(): Configuration {
        return this.configuration!;
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
