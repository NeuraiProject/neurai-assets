const { expect } = require('chai');
const IssueRootBuilder = require('../../../src/builders/IssueRootBuilder');

const LEGACY_ADDRESS = 'mgRYHdMqD1gwm9QQqBRUPcDKdEZ9oVeChA';

describe('BaseAssetTransactionBuilder fee-rate caching', () => {
  it('calls estimatesmartfee at most once per build', async () => {
    let estimateSmartFeeCalls = 0;

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getassetdata':
          throw new Error('asset not found');

        case 'estimatesmartfee':
          estimateSmartFeeCalls += 1;
          return { feerate: 0.015 };

        case 'getaddressutxos':
          return [
            {
              txid: '11'.repeat(32),
              outputIndex: 0,
              address: LEGACY_ADDRESS,
              script: '76a91409f2017224efdaf3633d26b1cf11a1df418496f688ac',
              satoshis: 200000_00000000,
            },
          ];

        case 'getaddressmempool':
          return [];

        case 'createrawtransaction':
          return 'deadbeef';

        default:
          throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
      }
    };

    const builder = new IssueRootBuilder(rpc, {
      network: 'xna-test',
      addresses: [LEGACY_ADDRESS],
      changeAddress: LEGACY_ADDRESS,
      toAddress: LEGACY_ADDRESS,
      assetName: 'CACHEDTEST',
      quantity: 1,
      units: 0,
      reissuable: true,
      hasIpfs: false,
    });

    await builder.build();

    // Each builder used to call estimatesmartfee twice (pre + post selection).
    // After the cache change it should be called exactly once per build.
    expect(estimateSmartFeeCalls).to.equal(1);
  });
});
