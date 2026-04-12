const { expect } = require('chai');
const { bech32m } = require('bech32');
const IssueRootBuilder = require('../../../src/builders/IssueRootBuilder');
const { TESTNET_BURN_ADDRESSES } = require('../../../src/constants/burnAddresses');
const { createFromOperation } = require('@neuraiproject/neurai-create-transaction');

describe('Build Result Metadata', () => {
  it('should expose burn and change metadata for root issuance', async () => {
    const toWords = bech32m.toWords(Buffer.alloc(32, 1));
    const changeWords = bech32m.toWords(Buffer.alloc(32, 2));
    const toAddress = bech32m.encode('tnq', [1, ...toWords]);
    const changeAddress = bech32m.encode('tnq', [1, ...changeWords]);

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getassetdata':
          throw new Error('asset not found');

        case 'getaddressutxos':
          return [
            {
              txid: '0000000000000000000000000000000000000000000000000000000000000001',
              outputIndex: 0,
              address: changeAddress,
              satoshis: 200000000000
            }
          ];

        case 'getaddressmempool':
          return [];

        case 'estimatesmartfee':
          return { feerate: 0.015 };

        case 'createrawtransaction':
          return 'deadbeef';

        default:
          throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
      }
    };

    const builder = new IssueRootBuilder(rpc, {
      network: 'xna-pq-test',
      walletAddresses: [changeAddress],
      changeAddress,
      toAddress,
      assetName: 'MYTOKEN',
      quantity: 1000,
      units: 2
    });

    const result = await builder.build();

    expect(result.rawTx).to.equal('deadbeef');
    expect(result.operationType).to.equal('ISSUE_ROOT');
    expect(result.network).to.equal('xna-pq-test');
    expect(result.buildStrategy).to.equal('rpc-node');
    expect(result.burnAmount).to.equal(1000);
    expect(result.burnAddress).to.equal(TESTNET_BURN_ADDRESSES.ISSUE_ROOT);
    expect(result.changeAddress).to.equal(changeAddress);
    expect(result.changeAmount).to.be.a('number');
    expect(result.changeAmount).to.be.greaterThan(0);
    expect(result.localRawBuild).to.deep.include({
      operationType: 'ISSUE_ROOT'
    });
    expect(result.inputs).to.have.length(1);
    expect(result.outputs).to.be.an('array');

    const burnOutput = result.outputs.find(output => {
      return Object.keys(output)[0] === TESTNET_BURN_ADDRESSES.ISSUE_ROOT;
    });
    const changeOutput = result.outputs.find(output => {
      return Object.keys(output)[0] === changeAddress && typeof Object.values(output)[0] === 'number';
    });

    expect(burnOutput).to.deep.equal({
      [TESTNET_BURN_ADDRESSES.ISSUE_ROOT]: 1000
    });
    expect(changeOutput).to.deep.equal({
      [changeAddress]: result.changeAmount
    });

    const localBuilt = createFromOperation(result.localRawBuild);
    expect(localBuilt.rawTx).to.be.a('string');
    expect(localBuilt.rawTx.length).to.be.greaterThan(0);
  });

  it('should keep localRawBuild compatible when mixing legacy and AuthScript destinations', async () => {
    const authScriptWords = bech32m.toWords(Buffer.alloc(32, 3));
    const authScriptAddress = bech32m.encode('tnq', [1, ...authScriptWords]);
    const legacyAddress = 't7pvKtaVzbcsUijMT3z8KA4bkF1XxUiKqN';

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getassetdata':
          throw new Error('asset not found');

        case 'getaddressutxos':
          return [
            {
              txid: '0000000000000000000000000000000000000000000000000000000000000002',
              outputIndex: 0,
              address: legacyAddress,
              satoshis: 200000000000
            }
          ];

        case 'getaddressmempool':
          return [];

        case 'estimatesmartfee':
          return { feerate: 0.015 };

        case 'createrawtransaction':
          return 'deadbeef';

        default:
          throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
      }
    };

    const builder = new IssueRootBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [legacyAddress],
      changeAddress: legacyAddress,
      toAddress: authScriptAddress,
      assetName: 'MIXED',
      quantity: 1000,
      units: 0
    });

    const result = await builder.build();
    const localBuilt = createFromOperation(result.localRawBuild);

    expect(result.changeAddress).to.equal(legacyAddress);
    expect(result.localRawBuild.params.toAddress).to.equal(authScriptAddress);
    expect(localBuilt.rawTx).to.be.a('string');
    expect(localBuilt.rawTx.length).to.be.greaterThan(0);
  });
});
