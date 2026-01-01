import {APIGatewayProxyResult} from 'aws-lambda';
import {LogEntry} from '../logging/logEntry';
import {Configuration} from '../configuration/configuration';

/*
 * A primitive container used during the request lifecycle
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
export class Container {

    private configuration: Configuration | null;
    private logEntry: LogEntry | null;
    private response: APIGatewayProxyResult | null;

    public constructor() {
        this.configuration = null;
        this.logEntry = null;
        this.response = null;
    }

    public setConfiguration(configuration: Configuration): void {
        this.configuration = configuration;
    }

    public getConfiguration(): Configuration {
        return this.configuration!;
    }

    public setLogEntry(logEntry: LogEntry): void {
        this.logEntry = logEntry;
    }

    public getLogEntry(): LogEntry {
        return this.logEntry!;
    }

    public setResponse(response: APIGatewayProxyResult): void {
        this.response = response;
    }

    public getResponse(): APIGatewayProxyResult {
        return this.response!;
    }
}
