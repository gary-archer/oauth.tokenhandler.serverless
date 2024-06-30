import {APIGatewayProxyResult} from 'aws-lambda';
import {LogEntry} from '../logging/logEntry.js';
import {Configuration} from '../configuration/configuration.js';

/*
 * A primitive container used during the request lifecycle
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
export class Container {

    private _configuration: Configuration | null;
    private _logEntry: LogEntry | null;
    private _response: APIGatewayProxyResult | null;

    public constructor() {
        this._configuration = null;
        this._logEntry = null;
        this._response = null;
    }

    public setConfiguration(configuration: Configuration): void {
        this._configuration = configuration;
    }

    public getConfiguration(): Configuration {
        return this._configuration!;
    }

    public setLogEntry(logEntry: LogEntry): void {
        this._logEntry = logEntry;
    }

    public getLogEntry(): LogEntry {
        return this._logEntry!;
    }

    public setResponse(response: APIGatewayProxyResult): void {
        this._response = response;
    }

    public getResponse(): APIGatewayProxyResult {
        return this._response!;
    }
}
