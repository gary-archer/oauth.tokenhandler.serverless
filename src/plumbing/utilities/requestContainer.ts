import {LogEntry} from '../logging/logEntry';

/*
 * Data built up during an HTTP request and shared between classes
 */
export interface RequestContainer {

    setLogEntry(logEntry: LogEntry): void;

    getLogEntry(): LogEntry;

    setAccessToken(accessToken: string): void;

    getAccessToken(): string | null;
}
