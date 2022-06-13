import {LoggingConfiguration} from '../configuration/loggingConfiguration';
import {ClientError} from '../errors/clientError';
import {ErrorUtils} from '../errors/errorUtils';
import {LogEntry} from './logEntry';

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
