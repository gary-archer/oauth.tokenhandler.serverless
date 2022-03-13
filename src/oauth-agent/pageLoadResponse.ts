/*
 * Data returned to the SPA whenever a browser tab loads
 */
export interface PageLoadResponse {
    isLoggedIn: string;
    handled: string;
    antiForgeryToken: string | null;
}
