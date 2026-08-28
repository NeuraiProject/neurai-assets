/**
 * The browser bundles must not touch Node-only globals.
 *
 * This library does much of its work inside a browser extension, where
 * `Buffer`, `process` and `require` do not exist. A single `Buffer.byteLength`
 * in the fee estimator shipped in 1.5.0 and broke every asset operation in the
 * extension with "Buffer is not defined" — the unit tests never saw it,
 * because they run in Node where the global is always there.
 *
 * So this loads the real bundle in a context where those globals are absent
 * and drives an actual build through it.
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BUNDLES = [
  ['dist/NeuraiAssets.global.js', 'NeuraiAssets'],
  ['dist/browser.js', null]
];

/** A context with the browser's globals and none of Node's. */
function browserContext() {
  const sandbox = {
    ArrayBuffer, Uint8Array, Uint32Array, DataView, TextEncoder, TextDecoder,
    Math, JSON, Object, Array, String, Number, Boolean, BigInt, Symbol, Date,
    RegExp, Error, TypeError, RangeError, Promise, Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    console, crypto: globalThis.crypto,
    setTimeout, clearTimeout
    // Deliberately absent: Buffer, process, require, module, global, __dirname.
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  return vm.createContext(sandbox);
}

const ADDRESS = 't7pvKtaVzbcsUijMT3z8KA4bkF1XxUiKqN';

function stubRpc() {
  return async (method, params = []) => {
    switch (method) {
      case 'getblockchaininfo': return { chain: 'test', asset_marker: 'xna' };
      case 'getaddressutxos': return (params[0] || {}).assetName
        ? []
        : [{ txid: 'a1'.repeat(32), outputIndex: 0, address: ADDRESS, satoshis: 500000 * 1e8 }];
      case 'getaddressmempool': return [];
      case 'estimatesmartfee': return { feerate: 0.015 };
      case 'createrawtransaction': return 'deadbeef';
      case 'getassetdata': throw new Error('asset not found');
      default: throw new Error(`Unexpected RPC method: ${method}`);
    }
  };
}

describe('browser bundles run without Node globals', () => {
  it('the global bundle loads with no Buffer, process or require', () => {
    const context = browserContext();
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'NeuraiAssets.global.js'), 'utf8');
    vm.runInContext(source, context);
    expect(context.NeuraiAssets).to.be.a('function');
    expect(context.Buffer).to.equal(undefined);
    expect(context.process).to.equal(undefined);
  });

  it('builds a DePIN issuance there — the operation that failed in the extension', async () => {
    const context = browserContext();
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'NeuraiAssets.global.js'), 'utf8');
    vm.runInContext(source, context);

    const assets = new context.NeuraiAssets(stubRpc(), {
      network: 'xna-test',
      addresses: [ADDRESS],
      changeAddress: ADDRESS,
      toAddress: ADDRESS
    });

    const result = await assets.createDepinAsset({ assetName: '&SENSOR', quantity: 1 });
    expect(result.createTransactionBuild.operationType).to.equal('ISSUE_DEPIN');
    expect(result.fee).to.be.a('number');
  });

  it('builds a root issuance and a transfer there too', async () => {
    const context = browserContext();
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'NeuraiAssets.global.js'), 'utf8');
    vm.runInContext(source, context);

    const rpc = async (method, params = []) => {
      if (method === 'getaddressutxos' && (params[0] || {}).assetName) {
        return [{ txid: 'c3'.repeat(32), outputIndex: 2, address: ADDRESS, assetName: 'ROOTX', satoshis: 1000 * 1e8 }];
      }
      return stubRpc()(method, params);
    };

    const assets = new context.NeuraiAssets(rpc, {
      network: 'xna-test', addresses: [ADDRESS], changeAddress: ADDRESS, toAddress: ADDRESS
    });

    const issued = await assets.createRootAsset({ assetName: 'ROOTY', quantity: 1000, units: 2 });
    expect(issued.createTransactionBuild.params.quantityRaw).to.equal(100000000000n);

    const sent = await assets.transferAsset({
      assetName: 'ROOTX', recipients: [{ address: ADDRESS, amount: 5 }]
    });
    expect(sent.createTransactionBuild.operationType).to.equal('STANDARD_TRANSFER');
  });

  BUNDLES.forEach(([file]) => {
    it(`${file} contains no Node-only global reference`, () => {
      const source = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
      // `ArrayBuffer.isView` is a browser global and must not match.
      const nodeOnly = source.match(/(?<![A-Za-z.])Buffer\s*\.|(?<![A-Za-z.])process\s*\./g);
      expect(nodeOnly, `found ${JSON.stringify(nodeOnly)}`).to.equal(null);
    });
  });
});
