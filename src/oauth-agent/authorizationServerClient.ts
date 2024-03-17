import axios, {AxiosRequestConfig} from 'axios';
import {URLSearchParams} from 'url';
import {OAuthAgentConfiguration} from '../configuration/oauthAgentConfiguration.js';
import {ErrorUtils} from '../errors/errorUtils.js';
import {OAuthErrorStatus} from '../errors/oauthErrorStatus.js';
import {QueryProcessor} from '../http/queryProcessor.js';
import {HttpProxy} from '../utilities/httpProxy.js';
import {OAuthLoginState} from './oauthLoginState.js';

/*
 * A class to deal with calls to the authorization server and other OAuth responsibilities
 */
export class AuthorizationServerClient {

    private readonly _configuration: OAuthAgentConfiguration;
    private readonly _httpProxy: HttpProxy;

    public constructor(configuration: OAuthAgentConfiguration, httpProxy: HttpProxy) {

        this._configuration = configuration;
        this._httpProxy = httpProxy;
    }

    /*
     * Generate values for the state cookie written before the authorization redirect
     */
    public generateLoginState(): OAuthLoginState {
        return new OAuthLoginState();
    }

    /*
     * Form the OpenID Connect authorization request URL
     */
    public getAuthorizationRequestUrl(loginState: OAuthLoginState): string {

        let url = this._configuration.api.authorizeEndpoint;
        url += '?';
        url += QueryProcessor.createQueryParameter('client_id', this._configuration.client.clientId);
        url += '&';
        url += QueryProcessor.createQueryParameter('redirect_uri', this._configuration.client.redirectUri);
        url += '&';
        url += QueryProcessor.createQueryParameter('response_type', 'code');
        url += '&';
        url += QueryProcessor.createQueryParameter('scope', this._configuration.client.scope);
        url += '&';
        url += QueryProcessor.createQueryParameter('state', loginState.state);
        url += '&';
        url += QueryProcessor.createQueryParameter('code_challenge', loginState.codeChallenge);
        url += '&';
        url += QueryProcessor.createQueryParameter('code_challenge_method', 'S256');
        return url;
    }

    /*
     * Send the authorization code grant message to the authorization server
     */
    public async sendAuthorizationCodeGrant(code: string, codeVerifier: string): Promise<any> {

        const formData = new URLSearchParams();
        formData.append('grant_type', 'authorization_code');
        formData.append('client_id', this._configuration.client.clientId);
        formData.append('client_secret', this._configuration.client.clientSecret);
        formData.append('code', code);
        formData.append('redirect_uri', this._configuration.client.redirectUri);
        formData.append('code_verifier', codeVerifier);

        const response = await this._postGrantMessage(formData);

        if (!response.refresh_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No refresh token was received in an authorization code grant response');
        }

        if (!response.access_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No access token was received in an authorization code grant response');
        }

        // We do not validate the id token since it is received in a direct HTTPS request
        if (!response.id_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No id token was received in an authorization code grant response');
        }

        return response;
    }

    /*
     * Forward the refresh token grant message to the authorization server
     */
    public async sendRefreshTokenGrant(refreshToken: string): Promise<any>  {

        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('client_id', this._configuration.client.clientId);
        formData.append('client_secret', this._configuration.client.clientSecret);
        formData.append('refresh_token', refreshToken);

        const response = await this._postGrantMessage(formData);
        if (!response.access_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No access token was received in a refresh token grant response');
        }

        return response;
    }

    /*
     * Get user info with the access token
     */
    public async getUserInfo(accessToken: string): Promise<any> {

        const options = {
            url: this._configuration.api.userInfoEndpoint,
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            httpsAgent: this._httpProxy.agent,
        };

        try {

            const response = await axios.request(options as AxiosRequestConfig);
            return response.data;

        } catch (e: any) {

            // See if we have a response body
            if (e.response && e.response.status && e.response.data) {

                // Process error data and include the 'error' and 'error_description' fields
                const errorData = e.response.data;
                if (errorData.error) {

                    // Throw an error with Authorization Server details
                    throw ErrorUtils.fromUserInfoResponseError(
                        e.response.status,
                        errorData.error,
                        errorData.error_description,
                        options.url);
                }
            }

            // Throw a generic client connectivity error
            throw ErrorUtils.fromOAuthHttpRequestError(e, options.url);
        }
    }

    /*
     * Create the OpenID Connect end session request URL
     */
    public getEndSessionRequestUrl(): string {

        // Start the URL
        let url = this._configuration.api.endSessionEndpoint;
        url += '?';
        url += QueryProcessor.createQueryParameter('client_id', this._configuration.client.clientId);
        url += '&';

        if (this._configuration.api.provider === 'cognito') {

            // Cognito has non standard parameters
            url += QueryProcessor.createQueryParameter(
                'logout_uri',
                this._configuration.client.postLogoutRedirectUri);

        } else {

            // For other providers supply the most standard values
            url += QueryProcessor.createQueryParameter(
                'post_logout_redirect_uri',
                this._configuration.client.postLogoutRedirectUri);
        }

        return url;
    }

    /*
     * Send a grant message to the authorization server
     */
    private async _postGrantMessage(formData: URLSearchParams): Promise<any> {

        // Define request options
        const options = {
            url: this._configuration.api.tokenEndpoint,
            method: 'POST',
            data: formData,
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'accept': 'application/json',
            },
            httpsAgent: this._httpProxy.agent,
        };

        try {

            // Call the authorization server and return the data
            const authServerResponse = await axios.request(options as AxiosRequestConfig);
            return authServerResponse.data;

        } catch (e: any) {

            // See if we have a response body
            if (e.response && e.response.status && e.response.data) {

                // Process error data and include the 'error' and 'error_description' fields
                const errorData = e.response.data;
                if (errorData.error) {

                    // Throw an error with Authorization Server details
                    const [statusCode, errorCode] = OAuthErrorStatus.processTokenResponseError(
                        formData.get('grant_type')!,
                        e.response.status,
                        errorData.error);

                    throw ErrorUtils.fromTokenResponseError(
                        statusCode,
                        errorCode,
                        errorData.error_description,
                        options.url);
                }
            }

            // Throw a generic client connectivity error
            throw ErrorUtils.fromOAuthHttpRequestError(e, options.url);
        }
    }
}
