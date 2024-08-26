/*
 * URL utilities
 */
export class QueryProcessor {

    /*
     * Return a URL encoded query parameter
     */
    public static createQueryParameter(key: string, value: string): string {
        return `${key}=${encodeURIComponent(value)}`;
    }
}
