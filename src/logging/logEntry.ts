import {APIGatewayProxyEvent} from 'aws-lambda';
import fs from 'fs-extra';
import {ClientError} from '../errors/clientError';
import {ServerError} from '../errors/serverError';
import {PathProcessor} from '../http/pathProcessor';
import {LogEntryData} from './logEntryData';

export class LogEntry {

    private readonly _data: LogEntryData;

    public constructor(apiName: string) {
        this._data = new LogEntryData(apiName);
        this._data.operationName = 'api';
    }

    /*
     * Methods to populate data during a request
     */
    public start(event: APIGatewayProxyEvent): void {

        if (event.httpMethod) {
            this._data.method = event.httpMethod;
        }

        this._data.path = PathProcessor.getFullPath(event);
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
     * Output data at the end of a request, but only when there is an error
     */
    public write(): void {

        if (this._data.errorData) {

            if (process.env.IS_LOCAL) {

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
}
