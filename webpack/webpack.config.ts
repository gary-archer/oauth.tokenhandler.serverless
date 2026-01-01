import path from 'path';
import webpack from 'webpack';
import {removeSourceMapReferences} from './rewriteSourceMaps';

/*
 * Performs tree shaking to reduce lambda sizes and improve cold start times
 */
const dirname = process.cwd();
const config: webpack.Configuration = {

    // Build for a node.js production target
    target: 'node',
    mode: 'production',
    devtool: 'source-map',
    context: path.resolve(dirname, '.'),

    // Provide the lambda entry point
    entry: {
        wildcard: ['./src/lambda/wildcard.ts'],
    },
    module: {
        rules: [
            {
                // Files with a .ts extension are loaded by the Typescript loader
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    },
    resolve: {

        // Set extensions for import statements, and the .js extension allows us to import modules from JS libraries
        extensions: ['.ts', '.js']
    },
    output: {

        // Serverless projects require the library webpack setting
        path: path.resolve(dirname, './dist'),
        filename: '[name].js',
        library: {
            type: 'module'
        },
        module: true,
        clean: true,
    },
    experiments: {
        outputModule: true,
    },
    plugins:[
        {
            // Remove source map references from release builds
            apply: (compiler: any) => {
                compiler.hooks.afterEmit.tap('AfterEmitPlugin', () => {
                    removeSourceMapReferences(['wildcard.js']);
                });
            }
        },
    ]
};

export default config;
