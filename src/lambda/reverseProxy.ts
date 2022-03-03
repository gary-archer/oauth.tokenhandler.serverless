import {APIGatewayProxyResult} from 'aws-lambda';

/*
 * Our handler just returns the AWS response document produced by cookie middleware
 */
const handler = async () : Promise<APIGatewayProxyResult> => {

    console.log('*** IN REVERSE PROXY');
    const data = {
        message: 'whatevar',
    };

    return {
        statusCode: 200,
        body: JSON.stringify(data),
    };
};

// Export the handler to serverless.yml
export {handler};