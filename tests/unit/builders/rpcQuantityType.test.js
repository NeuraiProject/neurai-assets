/**
 * Asset quantities reach `createrawtransaction` as JSON numbers.
 *
 * The node reads `asset_quantity` and `change_quantity` with `isNum()` and
 * rejects a quoted value ("missing asset data for key: asset_quantity"). The
 * builders accept decimal strings, which keep every digit, so the conversion
 * happens on the copy sent to the node. The asset fixture enforces the node's
 * rule, and the payload is serialized here with neurai-rpc, as a wallet sends
 * it, to check the exact token.
 */

const { expect } = require('chai');
const { stringifyRpcJson } = require('@neuraiproject/neurai-rpc');
const NeuraiAssets = require('../../../src/NeuraiAssets');
const { RpcDecimal, toRpcAmount, prepareOutputsForRpc } = require('../../../src/utils/rpcAmount');
const { ADDR } = require('../../fixtures/addresses');
const { createAssetRpc } = require('../../fixtures/assetRpc');

function ownerUtxo(assetName, satoshis = 1e8) {
  return { txid: 'b2'.repeat(32), outputIndex: 1, address: ADDR[0], assetName, satoshis };
}

function assetsWith(rpcOptions) {
  const rawTransactionParams = [];
  const rpc = createAssetRpc({
    xnaUtxos: [{ txid: 'a1'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 500000 * 1e8 }],
    assetMarker: 'xna',
    rawTransactionParams,
    ...rpcOptions
  });
  const assets = new NeuraiAssets(rpc, {
    network: 'xna-test',
    addresses: [ADDR[0]],
    changeAddress: ADDR[0],
    toAddress: ADDR[1]
  });
  return { assets, rawTransactionParams };
}

/** The operation object for `operation` in a list of outputs, and its address. */
function findOperation(outputs, operation) {
  for (const output of outputs) {
    const [address, payload] = Object.entries(output)[0];
    if (payload && typeof payload === 'object' && payload[operation]) {
      return { address, params: payload[operation] };
    }
  }
  return null;
}

/** The JSON token neurai-rpc sends for `field`. */
function sentToken(params, field) {
  const json = stringifyRpcJson({ [field]: params[field] });
  return json.slice(field.length + 4, -1);
}

const SCENARIOS = [
  {
    name: 'root issue',
    operation: 'issue',
    quantity: '1000.25',
    token: '1000.25',
    build: () => assetsWith({}),
    run: (assets) => assets.createRootAsset({ assetName: 'ROOTX', quantity: '1000.25', units: 2 })
  },
  {
    name: 'root issue that no JavaScript number carries',
    operation: 'issue',
    quantity: '9876543210.12345678',
    token: '9876543210.12345678',
    build: () => assetsWith({}),
    run: (assets) => assets.createRootAsset({ assetName: 'ROOTX', quantity: '9876543210.12345678', units: 8 })
  },
  {
    name: 'sub issue',
    operation: 'issue',
    quantity: '5',
    token: '5',
    build: () => assetsWith({
      assetMap: { PARENT: { amount: 10, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('PARENT!')]
    }),
    run: (assets) => assets.createSubAsset({ assetName: 'PARENT/CHILD', quantity: '5', units: 0 })
  },
  {
    name: 'DePIN issue',
    operation: 'issue',
    quantity: '1000',
    token: '1000',
    build: () => assetsWith({}),
    run: (assets) => assets.createDepinAsset({ assetName: '&SENSOR', quantity: '1000' })
  },
  {
    name: 'restricted issue',
    operation: 'issue_restricted',
    quantity: '100',
    token: '100',
    build: () => assetsWith({
      assetMap: { ROOTX: { amount: 1000, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    }),
    run: (assets) => assets.createRestrictedAsset({
      assetName: '$ROOTX', quantity: '100', units: 0, verifierString: '#KYC'
    })
  }
];

describe('createrawtransaction asset quantities', () => {
  for (const scenario of SCENARIOS) {
    it(`sends the ${scenario.name} quantity, given as a string, as a JSON number`, async () => {
      const { assets, rawTransactionParams } = scenario.build();

      const result = await scenario.run(assets);

      expect(rawTransactionParams).to.have.length(1);
      const sent = findOperation(rawTransactionParams[0][1], scenario.operation);
      expect(sent, `${scenario.operation} output sent to the node`).to.not.equal(null);
      expect(sentToken(sent.params, 'asset_quantity')).to.equal(scenario.token);

      // What the caller gets back is untouched: consumers show these outputs.
      const returned = findOperation(result.outputs, scenario.operation);
      expect(returned.params.asset_quantity).to.equal(scenario.quantity);
    });
  }

  it('keeps numeric quantities as they were', async () => {
    const { assets, rawTransactionParams } = assetsWith({});

    await assets.createRootAsset({ assetName: 'ROOTX', quantity: 1000, units: 0 });

    const sent = findOperation(rawTransactionParams[0][1], 'issue');
    expect(sent.params.asset_quantity).to.equal(1000);
  });
});

describe('toRpcAmount', () => {
  it('turns a decimal string into the number that writes it back exactly', () => {
    expect(toRpcAmount('1000')).to.equal(1000);
    expect(toRpcAmount('1000.50')).to.equal(1000.5);
    expect(toRpcAmount('0.00000001')).to.equal(1e-8);
    expect(toRpcAmount('21000000000')).to.equal(21000000000);
    expect(toRpcAmount('90071992.5474099')).to.equal(90071992.5474099);
    expect(toRpcAmount('12345678.12345678')).to.equal(12345678.12345678);
  });

  it('keeps the exact decimal when a number cannot carry it', () => {
    for (const text of ['9876543210.12345678', '100000000.5', '12345678901.2345678']) {
      const amount = toRpcAmount(text);
      expect(amount).to.be.instanceOf(RpcDecimal);
      expect(stringifyRpcJson({ asset_quantity: amount })).to.equal(`{"asset_quantity":${text}}`);
    }
  });

  it('never lets a decimal pass as a quoted string or a different amount', () => {
    // A serializer other than neurai-rpc leaves an object, which the node rejects.
    expect(JSON.stringify({ asset_quantity: toRpcAmount('9876543210.12345678') }))
      .to.not.match(/"asset_quantity":("|\d)/);
  });

  it('leaves numbers alone and rejects strings that are not exact amounts', () => {
    expect(toRpcAmount(5)).to.equal(5);
    expect(() => toRpcAmount('1e3', 'asset_quantity')).to.throw(/exponent/);
    expect(() => toRpcAmount('1.123456789', 'asset_quantity')).to.throw(/decimals/);
    expect(() => toRpcAmount('five', 'asset_quantity')).to.throw(/not a decimal/);
  });
});

describe('prepareOutputsForRpc', () => {
  it('converts only the numeric asset fields, on a copy', () => {
    const outputs = [
      { [ADDR[0]]: '12.5' },
      { [ADDR[1]]: { transfer: { 'ROOTX!': '1' } } },
      { [ADDR[2]]: { tag_addresses: { tag_name: '#KYC', addresses: [ADDR[3]], change_quantity: '10' } } },
      { [ADDR[3]]: { issue: { asset_name: 'ROOTX', asset_quantity: '1000', units: 0, reissuable: 1, has_ipfs: 0 } } }
    ];
    const snapshot = JSON.stringify(outputs);

    const sent = prepareOutputsForRpc(outputs);

    expect(JSON.stringify(outputs)).to.equal(snapshot);
    expect(sent[0]).to.deep.equal({ [ADDR[0]]: '12.5' });
    expect(sent[1]).to.deep.equal({ [ADDR[1]]: { transfer: { 'ROOTX!': '1' } } });
    expect(sent[2][ADDR[2]].tag_addresses.change_quantity).to.equal(10);
    expect(sent[3][ADDR[3]].issue).to.deep.equal({
      asset_name: 'ROOTX', asset_quantity: 1000, units: 0, reissuable: 1, has_ipfs: 0
    });
  });
});
