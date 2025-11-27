import {APIGatewayProxyResult} from 'aws-lambda';

/*
 * A utility to write REST responses from objects and deal with common aspects
 */
export class ResponseWriter {

    /*
     * Return data to the caller, which could be a success or error object
     * Invalid lambda response data results in a cryptic 502 error so ensure that we have a Javascript object
     */
    public static objectResponse(statusCode: number, body: any, headers: any = null): APIGatewayProxyResult {

        const response = {
            statusCode,
        } as APIGatewayProxyResult;

        if (headers) {
            response.headers = headers;
        }

        if (body && typeof body === 'object') {
            response.body = JSON.stringify(body);
        }

        return response;
    }
}
