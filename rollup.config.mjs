import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const plugins = [
  nodeResolve({
    browser: true,
    preferBuiltins: false
  }),
  commonjs()
];

export default [
  {
    input: './src/entries/index.mjs',
    output: [
      {
        file: './dist/index.js',
        format: 'esm',
        sourcemap: true
      },
      {
        file: './dist/index.cjs',
        format: 'cjs',
        exports: 'named',
        sourcemap: true
      }
    ],
    plugins
  },
  {
    input: './src/entries/browser.mjs',
    output: {
      file: './dist/browser.js',
      format: 'esm',
      sourcemap: true
    },
    plugins
  },
  {
    input: './src/entries/global.mjs',
    output: {
      file: './dist/NeuraiAssets.global.js',
      exports: 'named',
      format: 'iife',
      name: 'NeuraiAssetsBundle',
      sourcemap: true
    },
    plugins
  }
];
