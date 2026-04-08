const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

describe('browser bundles', function () {
  it('exposes NeuraiAssets on globalThis in the IIFE bundle', function () {
    const bundlePath = path.resolve(__dirname, '../../dist/NeuraiAssets.global.js');
    const bundleSource = fs.readFileSync(bundlePath, 'utf8');
    const context = {
      console,
      globalThis: {}
    };

    vm.runInNewContext(bundleSource, context);

    expect(context.globalThis.NeuraiAssets).to.be.a('function');
    expect(context.globalThis.NeuraiAssets.NeuraiAssets).to.equal(context.globalThis.NeuraiAssets);
    expect(context.globalThis.NeuraiAssets.AssetQueries).to.be.a('function');
  });

  it('exports the browser entry as ESM without CommonJS wrappers', async function () {
    const browserEntry = pathToFileURL(path.resolve(__dirname, '../../dist/browser.js')).href;
    const bundle = await import(browserEntry);
    const source = fs.readFileSync(path.resolve(__dirname, '../../dist/browser.js'), 'utf8');
    const sourceWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(bundle.default).to.be.a('function');
    expect(bundle.NeuraiAssets).to.equal(bundle.default);
    expect(bundle.AssetQueries).to.be.a('function');
    expect(sourceWithoutComments).to.not.match(/\brequire\s*\(/);
    expect(sourceWithoutComments).to.not.include('module.exports');
  });
});
