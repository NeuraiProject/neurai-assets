const { expect } = require('chai');
const TagAddressBuilder = require('../../../src/builders/TagAddressBuilder');

const TEST_ADDRESS = 'tnq1ps6h07gxnzwrgk0hpzaqdzyavgl7j98kz4nfkk3';
const TARGET_ADDRESS = 'tnq1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqh7w2g7';

describe('TagAddressBuilder', () => {
  it('should serialize tag change_quantity in base units for createrawtransaction', async () => {
    let capturedOutputs;

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getassetdata':
          return { amount: 10, units: 0, reissuable: 1 };

        case 'getaddressutxos': {
          const query = params[0] || {};
          if (query.assetName === '#KYC') {
            return [
              {
                txid: '02'.repeat(32),
                outputIndex: 0,
                address: TEST_ADDRESS,
                assetName: '#KYC',
                satoshis: 900000000
              }
            ];
          }

          return [
            {
              txid: '01'.repeat(32),
              outputIndex: 1,
              address: TEST_ADDRESS,
              satoshis: 3277869817594
            }
          ];
        }

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

    const builder = new TagAddressBuilder(rpc, {
      network: 'xna-pq-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      qualifierName: '#KYC',
      addresses: [TARGET_ADDRESS]
    });

    await builder.build();

    const tagOutput = capturedOutputs.find(output => {
      const value = Object.values(output)[0];
      return value && typeof value === 'object' && value.tag_addresses;
    });

    expect(tagOutput).to.not.equal(undefined);
    expect(tagOutput[TEST_ADDRESS].tag_addresses).to.deep.include({
      qualifier: '#KYC',
      change_quantity: 900000000
    });
  });
});
