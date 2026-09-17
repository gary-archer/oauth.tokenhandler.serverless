import {APIGatewayProxyEvent} from 'aws-lambda';
import {LogEntry} from '../logging/logEntry';

/*
 * The extended event stores the current request's log entry
 */
export interface APIGatewayProxyExtendedEvent extends APIGatewayProxyEvent {
    logEntry: LogEntry,
}
