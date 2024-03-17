/*
 * Data returned to the SPA whenever a browser tab loads
 */
export interface EndLoginResponse {
    isLoggedIn: boolean;
    handled: boolean;
    csrf: string | null;
}
