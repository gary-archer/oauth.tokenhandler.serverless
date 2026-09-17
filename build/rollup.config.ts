import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import {builtinModules} from 'module';
import path from 'path';
import {defineConfig, RollupOptions} from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

const outputFolder = 'dist';
const options: RollupOptions = {

    input: './src/lambda/wildcard.ts',
    output: {

        // Output ECMAScript modules
        dir: outputFolder,
        format: 'esm',
        entryFileNames: 'wildcard.js',

        // Enable source maps and use correct paths to support debugging
        sourcemap: true,
        sourcemapPathTransform: (relativeSourcePath: string, sourcemapPath: string) => {
            return path.resolve(path.dirname(sourcemapPath), relativeSourcePath);
        },
    },

    // Avoid packaging built in modules
    external: [
        ...builtinModules,
        ...builtinModules.map((m: string) => `node:${m}`),
        'aws-sdk',
    ],

    watch: {
        clearScreen: false,
    },

    plugins: [

        // Use Node.js resolution for node_modules
        nodeResolve({
            preferBuiltins: true,
        }),

        // Convert any commonjs libraries from the node_modules folder to ECMAScript
        commonjs(),

        // Use esbuild as an up to date plugin for building typescript code
        esbuild({
            tsconfig: './tsconfig.json',
            target: 'es2022',
        }),

        // Minimize release bundles
        terser(),
    ],
};

export default defineConfig(options);
