const { expect } = require('chai');
const { bech32m } = require('bech32');
const IssueQualifierBuilder = require('../../../src/builders/IssueQualifierBuilder');
const IssueRootBuilder = require('../../../src/builders/IssueRootBuilder');

const TEST_ADDRESS = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 7))]);

describe('IssueQualifierBuilder', () => {
  it('should serialize qualifier quantities in base units for createrawtransaction', async () => {
    let capturedOutputs;

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getassetdata':
          throw new Error('asset not found');

        case 'getaddressutxos':
          return [
            {
              txid: '01'.repeat(32),
              outputIndex: 1,
              address: TEST_ADDRESS,
              satoshis: 3277869817594
            }
          ];

        case 'getaddressmempool':
          return [];

        case 'estimatesmartfee':
          return { feerate: 0.015 };

        case 'createrawtransaction':
          capturedOutputs = params[1];
          return 'deadbeef';

        default:
          throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
      }
    };

    const builder = new IssueQualifierBuilder(rpc, {
      network: 'xna-pq-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: '#UIEIR',
      quantity: 5
    });

    await builder.build();

    const qualifierOutput = capturedOutputs.find(output => {
      const value = Object.values(output)[0];
      return value && typeof value === 'object' && value.issue_qualifier;
    });

    expect(qualifierOutput).to.not.equal(undefined);
    expect(qualifierOutput[TEST_ADDRESS].issue_qualifier).to.deep.include({
      asset_name: '#UIEIR',
      // The user-facing display value (5 qualifier tokens). The daemon
      // multiplies by 10^8 internally to get sats.
      asset_quantity: 5
    });
  });

  it('should serialize root asset quantities as the user-facing display value', async () => {
    let capturedOutputs;

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getassetdata':
          throw new Error('asset not found');

        case 'getaddressutxos':
          return [
            {
              txid: '02'.repeat(32),
              outputIndex: 1,
              address: TEST_ADDRESS,
              satoshis: 3277869817594
            }
          ];

        case 'getaddressmempool':
          return [];

        case 'estimatesmartfee':
          return { feerate: 0.015 };

        case 'createrawtransaction':
          capturedOutputs = params[1];
          return 'deadbeef';

        default:
          throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
      }
    };

    const builder = new IssueRootBuilder(rpc, {
      network: 'xna-pq-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: 'UIEIR',
      quantity: 1000,
      units: 2
    });

    await builder.build();

    const issueOutput = capturedOutputs.find(output => {
      const value = Object.values(output)[0];
      return value && typeof value === 'object' && value.issue;
    });

    expect(issueOutput).to.not.equal(undefined);
    expect(issueOutput[TEST_ADDRESS].issue).to.deep.include({
      asset_name: 'UIEIR',
      // Sent as the user-facing display value; the daemon's AmountFromValue
      // multiplies by 10^8 to get sats, and CheckAmountWithUnits validates
      // against the asset's `units` (here 2 → must be a multiple of 10^6 sats).
      asset_quantity: 1000,
      units: 2
    });
  });
});
