import {randomUUID} from 'crypto';
import os from 'os';
import {PerformanceBreakdown} from './performanceBreakdown.js';

/*
 * Each API request writes a structured log entry containing fields we will query by
 * It also writes JSON blobs whose fields are not designed to be queried
 */
export class LogEntryData {

    // A unique generated client side id, which becomes the unique id in the aggregated logs database
    public id: string;

    // The time when the API received the request
    public utcTime: Date;

    // The name of the API
    public apiName: string;

    // The name of the operation
    public operationName: string;

    // The host on which the request was processed
    public hostName: string;

    // The HTTP method
    public method: string;

    // The request path
    public path: string;

    // The calling application name
    public clientApplicationName: string;

    // The subject claim from the OAuth 2.0 access token
    public userId: string;

    // The status code returned
    public statusCode: number;

    // The time taken in API code
    public millisecondsTaken: number;

    // A time beyond which performance is considered 'slow'
    public performanceThresholdMilliseconds: number;

    // The error code for requests that failed
    public errorCode: string;

    // The specific error instance id, for 500 errors
    public errorId: number;

    // The correlation id, used to link related API requests together
    public correlationId: string;

    // A session id, to group related calls from a client together
    public sessionId: string;

    // An object containing performance data, written when performance is slow
    public performance: PerformanceBreakdown;

    // An object containing error data, written for failed requests
    public errorData: any;

    /*
     * Give fields default values
     */
    public constructor(apiName: string) {

        // Queryable fields
        this.id = randomUUID();
        this.utcTime = new Date();
        this.apiName = apiName;
        this.operationName = '';
        this.hostName = os.hostname();
        this.method = '';
        this.path = '';
        this.clientApplicationName = '';
        this.userId = '';
        this.statusCode = 0;
        this.millisecondsTaken = 0;
        this.performanceThresholdMilliseconds = 500;
        this.errorCode = '';
        this.errorId = 0;
        this.correlationId = '';
        this.sessionId = '';

        // Objects that are not directly queryable
        this.performance = new PerformanceBreakdown();
        this.errorData = null;
    }

    /*
     * Produce the output format
     */
    public toLogFormat(): void {

        // Output fields used as top level queryable columns
        const output: any = {};
        this.outputString((x) => output.id = x, this.id);
        this.outputString((x) => output.utcTime = x, this.utcTime.toISOString());
        this.outputString((x) => output.apiName = x, this.apiName);
        this.outputString((x) => output.operationName = x, this.operationName);
        this.outputString((x) => output.hostName = x, this.hostName);
        this.outputString((x) => output.method = x, this.method);
        this.outputString((x) => output.path = x, this.path);
        this.outputString((x) => output.clientApplicationName = x, this.clientApplicationName);
        this.outputString((x) => output.userId = x, this.userId);
        this.outputNumber((x) => output.statusCode = x, this.statusCode);
        this.outputString((x) => output.errorCode = x, this.errorCode);
        this.outputNumber((x) => output.errorId = x, this.errorId);
        this.outputString((x) => output.correlationId = x, this.correlationId);
        this.outputNumber((x) => output.millisecondsTaken = x, this.millisecondsTaken, true);
        this.outputNumber((x) => output.millisecondsThreshold = x, this.performanceThresholdMilliseconds, true);
        this.outputString((x) => output.sessionId = x, this.sessionId);

        // Output errors as an object
        this.outputError(output);
        return output;
    }

    /*
     * Add a string to the output unless empty
     */
    private outputString(setter: (val: string) => void, value: string): void {

        if (value.length > 0) {
            setter(value);
        }
    }

    /*
     * Add a number to the output unless zero or forced
     */
    private outputNumber(setter: (val: number) => void, value: number, force = false): void {

        if (value > 0 || force) {
            setter(value);
        }
    }

    /*
     * Add error details if applicable
     */
    private outputError(output: any): void {

        if (this.errorData !== null) {
            output.errorData = this.errorData;
        }
    }
}
