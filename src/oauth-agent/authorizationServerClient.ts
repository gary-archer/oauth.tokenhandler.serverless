import axios, {AxiosRequestConfig} from 'axios';
import {URLSearchParams} from 'url';
import {OAuthAgentConfiguration} from '../configuration/oauthAgentConfiguration';
import {ErrorUtils} from '../errors/errorUtils';
import {QueryProcessor} from '../http/queryProcessor';
import {HttpProxy} from '../utilities/httpProxy';
import {OAuthLoginState} from './oauthLoginState';

/*
 * A class to deal with calls to the Authorization Server and other OAuth responsibilities
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
    public getAuthorizationRequestUri(loginState: OAuthLoginState): string {

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
     * Send the authorization code grant message to the Authorization Server
     */
    public async sendAuthorizationCodeGrant(code: string, codeVerifier: string): Promise<any> {

        const formData = new URLSearchParams();
        formData.append('grant_type', 'authorization_code');
        formData.append('client_id', this._configuration.client.clientId);
        formData.append('client_secret', this._configuration.client.clientSecret);
        formData.append('code', code);
        formData.append('redirect_uri', this._configuration.client.redirectUri);
        formData.append('code_verifier', codeVerifier);

        const authCodeGrantData = await this._postGrantMessage(formData);

        if (!authCodeGrantData.refresh_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No refresh token was received in an authorization code grant response');
        }

        if (!authCodeGrantData.access_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No access token was received in an authorization code grant response');
        }

        // We do not validate the id token since it is received in a direct HTTPS request
        if (!authCodeGrantData.id_token) {
            throw ErrorUtils.createInvalidOAuthResponseError(
                'No id token was received in an authorization code grant response');
        }
    }

    /*
     * Forward the refresh token grant message to the Authorization Server
     */
    public async sendRefreshTokenGrant(refreshToken: string): Promise<any>  {

        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('client_id', this._configuration.client.clientId);
        formData.append('client_secret', this._configuration.client.clientSecret);
        formData.append('refresh_token', refreshToken);
        return this._postGrantMessage(formData);
    }

    /*
     * Create the OpenID Connect end session request URL
     */
    public getEndSessionRequestUri(idToken: string): string {

        // Start the URL
        let url = this._configuration.api.endSessionEndpoint;
        url += '?';
        url += QueryProcessor.createQueryParameter('client_id', this._configuration.client.clientId);
        url += '&';

        if (this._configuration.api.provider === 'cognito') {

            // Cognito has non standard parameters
            url += QueryProcessor.createQueryParameter('logout_uri', this._configuration.client.postLogoutRedirectUri);

        } else {

            // For other providers supply the most standard values
            url += QueryProcessor.createQueryParameter(
                'post_logout_redirect_uri',
                this._configuration.client.postLogoutRedirectUri);
            url += '&';
            url += QueryProcessor.createQueryParameter('id_token_hint', idToken);
        }

        return url;
    }

    /*
     * Send a grant message to the Authorization Server
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

            // Call the Authorization Server and return the data
            const authServerResponse = await axios.request(options as AxiosRequestConfig);
            return authServerResponse.data;

        } catch (e: any) {

            // See if we have a response body
            if (e.response && e.response.status && e.response.data) {

                // Process error data and include the 'error' and 'error_description' fields
                const errorData = e.response.data;
                if (errorData.error) {

                    // Throw an error with Authorization Server details, such as invalid_grant
                    throw ErrorUtils.fromTokenResponseError(errorData.error, errorData.error_description, options.url);
                }
            }

            // Throw a generic client connectivity error
            throw ErrorUtils.fromOAuthHttpRequestError(e, options.url);
        }
    }
}
