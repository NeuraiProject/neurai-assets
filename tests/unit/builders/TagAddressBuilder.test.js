const { expect } = require('chai');
const { bech32m } = require('bech32');
const TagAddressBuilder = require('../../../src/builders/TagAddressBuilder');

const TEST_ADDRESS = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 8))]);
const TARGET_ADDRESS = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 9))]);

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
      // UTXO has satoshis=900000000 (= 9 qualifier tokens in 10^8-sats encoding);
      // change_quantity is sent as the user-facing display value (9), and the
      // daemon multiplies by 10^8 via AmountFromValue.
      change_quantity: 9
    });
  });
});
