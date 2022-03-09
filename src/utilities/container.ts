import {LogEntry} from '../logging/logEntry';
import {Configuration} from '../configuration/configuration';

/*
 * A primitive container used during the request lifecycle
 */
export class Container {

    private _configuration: Configuration | null;
    private _logEntry: LogEntry | null;
    private _accessToken: string | null;

    public constructor() {
        this._configuration = null;
        this._logEntry = null;
        this._accessToken = null;
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

    public setAccessToken(accessToken: string): void {
        this._accessToken = accessToken;
    }

    public getAccessToken(): string | null {
        return this._accessToken;
    }
}
