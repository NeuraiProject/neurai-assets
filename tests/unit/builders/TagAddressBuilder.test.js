const assert = require('node:assert/strict');
const { expect } = require('chai');
const { bech32m } = require('bech32');
const TagAddressBuilder = require('../../../src/builders/TagAddressBuilder');

const TEST_ADDRESS = bech32m.encode('tnc', [1, ...bech32m.toWords(Buffer.alloc(32, 8))]);
const TARGET_ADDRESS = bech32m.encode('tnc', [1, ...bech32m.toWords(Buffer.alloc(32, 9))]);

describe('TagAddressBuilder', () => {
  it('rejects invalid asset destinations before asking the node to build', async () => {
    const p2sh = '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br';
    const mainnet = bech32m.encode('nc', [1, ...bech32m.toWords(Buffer.alloc(32, 9))]);
    const rpc = async () => assert.fail('unexpected RPC call');
    const builder = new TagAddressBuilder(rpc, { network: 'xna-test', walletAddresses: [TEST_ADDRESS] });
    for (const destination of [p2sh, mainnet]) {
      for (const output of [
        { [destination]: { transfer: { TEST: 1 } } },
        { [TEST_ADDRESS]: { tag_addresses: { addresses: [destination] } } },
        { [TEST_ADDRESS]: { issue: { owner_change_address: destination } } },
        { [TEST_ADDRESS]: { issue: { root_change_address: destination } } }
      ]) {
        assert.throws(() => builder.buildRawTransactionLocally({}, [output]), /Unsupported legacy address prefix|but expected xna-test/);
        await assert.rejects(builder.buildRawTransaction([], [output]), /Unsupported legacy address prefix|but expected xna-test/);
      }
    }
  });

  it('should serialize tag change_quantity in base units for createrawtransaction', async () => {
    let capturedOutputs;

    const rpc = async (method, params = []) => {
      switch (method) {
        case 'getblockchaininfo':
          return { chain: 'test', asset_marker: 'rvn' };
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
