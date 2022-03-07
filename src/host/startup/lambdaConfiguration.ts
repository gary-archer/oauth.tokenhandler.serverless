import middy from '@middy/core';
import {APIGatewayProxyEvent, APIGatewayProxyResult, Context} from 'aws-lambda';
import fs from 'fs-extra';
import {LoggerFactory} from '../../plumbing/logging/loggerFactory';
import {CorsMiddleware} from '../../plumbing/middleware/corsMiddleware';
import {ExceptionMiddleware} from '../../plumbing/middleware/exceptionMiddleware';
import {LoggerMiddleware} from '../../plumbing/middleware/loggerMiddleware';
import {ResponseWriter} from '../../plumbing/utilities/responseWriter';
import {Configuration} from '../configuration/configuration';
import {Container} from './container';

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

            // Create middleware objects
            const loggerMiddleware = new LoggerMiddleware(loggerFactory);
            const corsMiddleware = new CorsMiddleware(configuration.routes);
            const exceptionMiddleware = new ExceptionMiddleware(loggerFactory);

            // Add them to the base handler
            return middy(async (event: APIGatewayProxyEvent, context: Context) => {
                return baseHandler(event, context);

            })
                .use(loggerMiddleware)
                .use(exceptionMiddleware)
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