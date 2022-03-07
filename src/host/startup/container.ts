import {Configuration} from '../configuration/configuration';

/*
 * A very basic container to return some fixed oblects
 */
export class Container {

    private _configuration: Configuration | null;

    public constructor() {
        this._configuration = null;
    }

    public setConfiguration(configuration: Configuration): void {
        this._configuration = configuration;
    }

    public getConfiguration(): Configuration {
        return this._configuration!;
    }
}
