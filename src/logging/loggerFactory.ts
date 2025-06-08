import {LoggingConfiguration} from '../configuration/loggingConfiguration.js';
import {ClientError} from '../errors/clientError.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {LogEntry} from './logEntry.js';

/*
 * A logging factory
 */
export class LoggerFactory {

    private name: string;
    private prettyPrint: boolean;

    public constructor() {
        this.name = 'TokenHandler';
        this.prettyPrint = false;
    }

    public configure(configuration: LoggingConfiguration): void {
        this.name = configuration.apiName;
        this.prettyPrint = configuration.prettyPrint;

    }

    public get apiName(): string {
        return this.name;
    }

    public logStartupError(exception: any): ClientError {

        const error = ErrorUtils.createServerError(exception);
        const logEntry = this.createLogEntry();
        logEntry.setOperationName('startup');
        logEntry.setServerError(error);
        logEntry.write();

        return error.toClientError(this.name);
    }

    public createLogEntry(): LogEntry {
        return new LogEntry(this.name, this.prettyPrint);
    }
}
