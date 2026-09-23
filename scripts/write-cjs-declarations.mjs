// CommonJS declarations for the `require` entry (dist/index.cjs).
//
// index.d.ts is written by hand, self-contained, and describes both entry
// points: dist/index.cjs exports the same values as dist/index.js, with
// `exports.default === NeuraiAssets`. In a "type": "module" package that file
// is read as ESM, which a CommonJS consumer resolving with moduleResolution
// node16 cannot use (TS1471). The same declarations are written as
// dist/index.d.cts, which TypeScript reads as CommonJS.
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../index.d.ts', import.meta.url), new URL('../dist/index.d.cts', import.meta.url));
