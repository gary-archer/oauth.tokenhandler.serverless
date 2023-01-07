import {LoggingConfiguration} from '../configuration/loggingConfiguration.js';
import {ClientError} from '../errors/clientError.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {LogEntry} from './logEntry.js';

/*
 * A logging factory
 */
export class LoggerFactory {

    private _name: string;
    private _prettyPrint: boolean;

    public constructor() {
        this._name = 'TokenHandler';
        this._prettyPrint = false;
    }

    public configure(configuration: LoggingConfiguration): void {
        this._name = configuration.apiName;
        this._prettyPrint = configuration.prettyPrint;

    }

    public get apiName(): string {
        return this._name;
    }

    public logStartupError(exception: any): ClientError {

        const error = ErrorUtils.createServerError(exception);
        const logEntry = this.createLogEntry();
        logEntry.setOperationName('startup');
        logEntry.setServerError(error);
        logEntry.write();

        return error.toClientError(this._name);
    }

    public createLogEntry(): LogEntry {
        return new LogEntry(this._name, this._prettyPrint);
    }
}
