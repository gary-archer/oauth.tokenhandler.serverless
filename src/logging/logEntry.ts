import {APIGatewayProxyEvent} from 'aws-lambda';
import {randomUUID} from 'crypto';
import fs from 'node:fs/promises';
import {ClientError} from '../errors/clientError';
import {ServerError} from '../errors/serverError';
import {HeaderProcessor} from '../http/headerProcessor';
import {PathProcessor} from '../http/pathProcessor';
import {TextValidator} from '../utilities/textValidator';
import {LogEntryData} from './logEntryData';

export class LogEntry {

    private readonly data: LogEntryData;
    private readonly prettyPrint: boolean;

    public constructor(apiName: string, prettyPrint: boolean) {
        this.data = new LogEntryData(apiName);
        this.data.operationName = 'api';
        this.prettyPrint = prettyPrint;
    }

    /*
     * Methods to populate data during a request
     */
    public start(event: APIGatewayProxyEvent): void {

        this.data.performance.start();
        this.data.path = PathProcessor.getFullPath(event);
        this.data.method = event.httpMethod;

        // Use the correlation id from request headers or create one
        let correlationId = HeaderProcessor.readHeader(event, 'correlation-id');
        if (correlationId) {
            correlationId = TextValidator.sanitize(correlationId);
        }
        this.data.correlationId = correlationId ? correlationId : randomUUID();
    }

    public getCorrelationId(): string {
        return this.data.correlationId;
    }

    public setOperationName(name: string): void {
        this.data.operationName = name;
    }

    public setIdTokenInfo(userId: string, sessionId: string): void {
        this.data.userId = userId;
        this.data.sessionId = sessionId;
    }

    public setResponseStatus(statusCode: number): void {
        this.data.statusCode = statusCode;
    }

    public setClientError(error: ClientError): void {
        this.data.errorData = error.toLogFormat();
        this.data.errorCode = error.getErrorCode();
    }

    public setServerError(error: ServerError): void {
        this.data.errorData = error.toLogFormat(this.data.apiName);
        this.data.errorCode = error.getErrorCode();
        this.data.errorId = error.getInstanceId();
    }

    public setErrorCodeOverride(code: string): void {
        this.data.errorCode = code;
    }

    /*
     * Output data at the end of a request
     */
    public write(): void {

        this.data.performance[Symbol.dispose]();
        this.data.millisecondsTaken = this.data.performance.getMillisecondsTaken();

        if (this.willLog()) {

            if (this.prettyPrint) {

                // On a developer PC, output from 'npm run lambda' is written with pretty printing to a file
                const data = JSON.stringify(this.data.toLogFormat(), null, 2);
                fs.appendFile('./test/lambdatest.log', data);

            } else {

                // In AWS Cloudwatch we use bare JSON logging that will work best with log shippers
                // Note that the format remains readable in the Cloudwatch console
                process.stdout.write(JSON.stringify(this.data.toLogFormat()) + '\n');
            }
        }
    }

    /*
     * The OAuth Agent acts like an API, so all requests are logged except preflight OPTIONS requests
     * OAuth Proxy requests are not logged unless there are errors, since the request is logged by the target API
     */
    private  willLog(): boolean {

        if (this.data.errorData) {
            return true;
        }

        if (this.data.path.toLowerCase().startsWith('/oauth-agent') && this.data.method.toLowerCase() !== 'options') {
            return true;
        }

        return false;
    }
}
