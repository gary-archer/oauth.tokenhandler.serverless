import {Guid} from 'guid-typescript';
import os from 'os';

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

    // The status code returned
    public statusCode: number;

    // The error code for requests that failed
    public errorCode: string;

    // The specific error instance id, for 500 errors
    public errorId: number;

    // An object containing error data, written for failed requests
    public errorData: any;

    /*
     * Give fields default values
     */
    public constructor(apiName: string) {

        // Queryable fields
        this.id = Guid.create().toString();
        this.utcTime = new Date();
        this.apiName = apiName;
        this.operationName = '';
        this.hostName = os.hostname();
        this.method = '';
        this.path = '';
        this.statusCode = 0;
        this.errorCode = '';
        this.errorId = 0;

        // Objects that are not directly queryable
        this.errorData = null;
    }

    /*
     * Produce the output format
     */
    public toLogFormat(): void {

        // Output fields used as top level queryable columns
        const output: any = {};
        this._outputString((x) => output.id = x, this.id);
        this._outputString((x) => output.utcTime = x, this.utcTime.toISOString());
        this._outputString((x) => output.apiName = x, this.apiName);
        this._outputString((x) => output.operationName = x, this.operationName);
        this._outputString((x) => output.hostName = x, this.hostName);
        this._outputString((x) => output.method = x, this.method);
        this._outputString((x) => output.path = x, this.path);
        this._outputNumber((x) => output.statusCode = x, this.statusCode);
        this._outputString((x) => output.errorCode = x, this.errorCode);
        this._outputNumber((x) => output.errorId = x, this.errorId);

        // Output errors as an object
        this._outputError(output);
        return output;
    }

    /*
     * Add a string to the output unless empty
     */
    private _outputString(setter: (val: string) => void, value: string): void {

        if (value.length > 0) {
            setter(value);
        }
    }

    /*
     * Add a number to the output unless zero or forced
     */
    private _outputNumber(setter: (val: number) => void, value: number, force = false): void {

        if (value > 0 || force) {
            setter(value);
        }
    }

    /*
     * Add error details if applicable
     */
    private _outputError(output: any): void {

        if (this.errorData !== null) {
            output.errorData = this.errorData;
        }
    }
}
