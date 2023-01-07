import {APIGatewayProxyEvent} from 'aws-lambda';
import fs from 'fs-extra';
import {Guid} from 'guid-typescript';
import {ClientError} from '../errors/clientError.js';
import {ServerError} from '../errors/serverError.js';
import {HeaderProcessor} from '../http/headerProcessor.js';
import {PathProcessor} from '../http/pathProcessor.js';
import {LogEntryData} from './logEntryData.js';

export class LogEntry {

    private readonly _data: LogEntryData;
    private readonly _prettyPrint: boolean;

    public constructor(apiName: string, prettyPrint: boolean) {
        this._data = new LogEntryData(apiName);
        this._data.operationName = 'api';
        this._prettyPrint = prettyPrint;
    }

    /*
     * Methods to populate data during a request
     */
    public start(event: APIGatewayProxyEvent): void {

        this._data.performance.start();
        this._data.path = PathProcessor.getFullPath(event);
        this._data.method = event.httpMethod;

        const clientApplicationName = HeaderProcessor.readHeader(event, 'x-mycompany-api-client');
        if (clientApplicationName) {
            this._data.clientApplicationName = clientApplicationName;
        }

        const correlationId = HeaderProcessor.readHeader(event, 'x-mycompany-correlation-id');
        this._data.correlationId = correlationId ? correlationId : Guid.create().toString();

        const sessionId = HeaderProcessor.readHeader(event, 'x-mycompany-session-id');
        if (sessionId) {
            this._data.sessionId = sessionId;
        }
    }

    public getCorrelationId(): string {
        return this._data.correlationId;
    }

    public setOperationName(name: string): void {
        this._data.operationName = name;
    }

    public setUserId(userId: string): void {
        this._data.userId = userId;
    }

    public setResponseStatus(statusCode: number): void {
        this._data.statusCode = statusCode;
    }

    public setClientError(error: ClientError): void {
        this._data.errorData = error.toLogFormat();
        this._data.errorCode = error.getErrorCode();
    }

    public setServerError(error: ServerError): void {
        this._data.errorData = error.toLogFormat(this._data.apiName);
        this._data.errorCode = error.getErrorCode();
        this._data.errorId = error.getInstanceId();
    }

    public setErrorCodeOverride(code: string): void {
        this._data.errorCode = code;
    }

    /*
     * Output data at the end of a request
     */
    public write(): void {

        this._data.performance.dispose();
        this._data.millisecondsTaken = this._data.performance.millisecondsTaken;

        if (this._willLog()) {

            if (this._prettyPrint) {

                // On a developer PC, output from 'npm run lambda' is written with pretty printing to a file
                const data = JSON.stringify(this._data.toLogFormat(), null, 2);
                fs.appendFileSync('./test/lambdatest.log', data);

            } else {

                // In AWS Cloudwatch we use bare JSON logging that will work best with log shippers
                // Note that the format remains readable in the Cloudwatch console
                process.stdout.write(JSON.stringify(this._data.toLogFormat()) + '\n');
            }
        }
    }

    /*
     * The OAuth Agent acts like an API, so all requests are logged except preflight OPTIONS requests
     * OAuth Proxy requests are not logged unless there are errors, since the request is logged by the target API
     */
    private _willLog(): boolean {

        if (this._data.errorData) {
            return true;
        }

        if (this._data.path.toLowerCase().startsWith('/oauth-agent') && this._data.method.toLowerCase() !== 'options') {
            return true;
        }

        return false;
    }
}
