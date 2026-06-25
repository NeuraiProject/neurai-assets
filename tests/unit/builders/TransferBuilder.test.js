const { expect } = require('chai');
const { bech32m } = require('bech32');
const TransferBuilder = require('../../../src/builders/TransferBuilder');
const NeuraiAssets = require('../../../src/NeuraiAssets');
const { OwnerTokenNotFoundError } = require('../../../src/errors');

const TEST_ADDRESS = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 7))]);
const RECIPIENT = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 9))]);

/**
 * In-memory RPC stub for TransferBuilder tests.
 *
 * @param {object} options
 * @param {string} options.assetName - asset being transferred (e.g. 'ROOT', '&DEV')
 * @param {number} options.assetUtxoSatoshis - asset balance available, in 10^8-sats
 *   (so 1000000000 = 10 units, 100000000 = 1 unit)
 * @param {boolean} [options.includeOwner=true] - whether the owner token UTXO exists
 *   (only relevant for DePIN assets)
 * @param {number} [options.ownerUtxoSatoshis=100000000] - satoshis on the owner UTXO
 */
function buildRpc({ assetName, assetUtxoSatoshis, includeOwner = true, ownerUtxoSatoshis = 100000000 }) {
  let captured;
  const ownerName = `${assetName}!`;

  const rpc = async (method, params = []) => {
    switch (method) {
      case 'getaddressutxos': {
        const query = params[0] || {};
        if (query.assetName === ownerName) {
          if (!includeOwner) return [];
          return [
            {
              txid: '02'.repeat(32),
              outputIndex: 1,
              address: TEST_ADDRESS,
              assetName: ownerName,
              satoshis: ownerUtxoSatoshis,
            },
          ];
        }
        if (query.assetName === assetName) {
          return [
            {
              txid: '03'.repeat(32),
              outputIndex: 2,
              address: TEST_ADDRESS,
              assetName,
              satoshis: assetUtxoSatoshis,
            },
          ];
        }
        // XNA UTXOs — plenty for the fee
        return [
          {
            txid: '01'.repeat(32),
            outputIndex: 0,
            address: TEST_ADDRESS,
            satoshis: 5000000000000, // 50,000 XNA
          },
        ];
      }

      case 'getaddressmempool':
        return [];

      case 'estimatesmartfee':
        return { feerate: 0.015 };

      case 'createrawtransaction':
        captured = params[1];
        return 'deadbeef';

      default:
        throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
    }
  };

  return { rpc, getCapturedOutputs: () => captured };
}

function makeBuilder(rpc, params) {
  return new TransferBuilder(rpc, {
    network: 'xna-test',
    walletAddresses: [TEST_ADDRESS],
    changeAddress: TEST_ADDRESS,
    toAddress: TEST_ADDRESS,
    ...params,
  });
}

/** Find the transfer amount of `assetName` sent to `address` in captured outputs. */
function transferAmount(outputs, address, assetName) {
  for (const out of outputs) {
    const [addr, value] = Object.entries(out)[0];
    if (addr === address && value && typeof value === 'object' && value.transfer &&
        value.transfer[assetName] !== undefined) {
      return value.transfer[assetName];
    }
  }
  return undefined;
}

/** Does any output transfer an owner token (asset name ending with '!')? */
function hasOwnerTransfer(outputs) {
  return outputs.some(out => {
    const value = Object.values(out)[0];
    return value && typeof value === 'object' && value.transfer &&
      Object.keys(value.transfer).some(name => name.endsWith('!'));
  });
}

describe('TransferBuilder', () => {
  describe('regular asset transfer', () => {
    it('builds a transfer + asset change with no owner token involved', async () => {
      const { rpc, getCapturedOutputs } = buildRpc({
        assetName: 'ROOT',
        assetUtxoSatoshis: 1000000000, // 10 units available
      });

      const result = await makeBuilder(rpc, {
        assetName: 'ROOT',
        recipients: [{ address: RECIPIENT, amount: 5 }],
      }).build();

      const outputs = getCapturedOutputs();

      // recipient gets 5, sender keeps 5 of change
      expect(transferAmount(outputs, RECIPIENT, 'ROOT')).to.equal(5);
      expect(transferAmount(outputs, TEST_ADDRESS, 'ROOT')).to.equal(5);

      // no owner token anywhere (inputs or outputs)
      expect(hasOwnerTransfer(outputs)).to.equal(false);
      expect(result.inputs.some(i => i.assetName && i.assetName.endsWith('!'))).to.equal(false);
      expect(result.isDepin).to.equal(false);
      expect(result.operationType).to.equal('TRANSFER');
    });

    it('sends the user-facing amount (no ×10^8 inflation on the asset change)', async () => {
      const { rpc, getCapturedOutputs } = buildRpc({
        assetName: 'SCALE',
        assetUtxoSatoshis: 1000000000, // 10 units
      });

      await makeBuilder(rpc, {
        assetName: 'SCALE',
        recipients: [{ address: RECIPIENT, amount: 3 }],
      }).build();

      const outputs = getCapturedOutputs();
      // 10 - 3 = 7 (not 7e8, not 0.00000007)
      expect(transferAmount(outputs, RECIPIENT, 'SCALE')).to.equal(3);
      expect(transferAmount(outputs, TEST_ADDRESS, 'SCALE')).to.equal(7);
    });

    it('omits the asset change output when the UTXO is fully spent', async () => {
      const { rpc, getCapturedOutputs } = buildRpc({
        assetName: 'EXACT',
        assetUtxoSatoshis: 500000000, // 5 units, send all 5
      });

      await makeBuilder(rpc, {
        assetName: 'EXACT',
        recipients: [{ address: RECIPIENT, amount: 5 }],
      }).build();

      const outputs = getCapturedOutputs();
      expect(transferAmount(outputs, RECIPIENT, 'EXACT')).to.equal(5);
      expect(transferAmount(outputs, TEST_ADDRESS, 'EXACT')).to.equal(undefined);
    });
  });

  describe('DePIN (soulbound) transfer', () => {
    it('spends AND returns the owner token (satisfies both consensus checks)', async () => {
      const { rpc, getCapturedOutputs } = buildRpc({
        assetName: '&DEVICE',
        assetUtxoSatoshis: 100000000, // 1 unit
      });

      const result = await makeBuilder(rpc, {
        assetName: '&DEVICE',
        recipients: [{ address: RECIPIENT, amount: 1 }],
      }).build();

      const outputs = getCapturedOutputs();

      // (1) spendsOwnerToken: an input is the owner token &DEVICE!
      expect(result.inputs.some(i => i.assetName === '&DEVICE!')).to.equal(true);

      // (2) transfersOwnerToken: an output transfers &DEVICE! back to the sender
      expect(transferAmount(outputs, TEST_ADDRESS, '&DEVICE!')).to.equal(1.0);

      // the asset itself reaches the recipient
      expect(transferAmount(outputs, RECIPIENT, '&DEVICE')).to.equal(1);

      expect(result.isDepin).to.equal(true);
      expect(result.ownerTokenUsed).to.equal('&DEVICE!');
    });

    it('throws OwnerTokenNotFoundError when the owner token is missing', async () => {
      const { rpc } = buildRpc({
        assetName: '&DEVICE',
        assetUtxoSatoshis: 100000000,
        includeOwner: false,
      });

      let error;
      try {
        await makeBuilder(rpc, {
          assetName: '&DEVICE',
          recipients: [{ address: RECIPIENT, amount: 1 }],
        }).build();
      } catch (err) {
        error = err;
      }

      expect(error).to.be.instanceOf(OwnerTokenNotFoundError);
      expect(error.message).to.include('&DEVICE!');
    });

    it('charges a higher fee than the equivalent non-DePIN transfer (extra input+output)', async () => {
      const normal = await makeBuilder(
        buildRpc({ assetName: 'WIDGET', assetUtxoSatoshis: 100000000 }).rpc,
        { assetName: 'WIDGET', recipients: [{ address: RECIPIENT, amount: 1 }] }
      ).build();

      const depin = await makeBuilder(
        buildRpc({ assetName: '&WIDGET', assetUtxoSatoshis: 100000000 }).rpc,
        { assetName: '&WIDGET', recipients: [{ address: RECIPIENT, amount: 1 }] }
      ).build();

      expect(depin.fee).to.be.greaterThan(normal.fee);
    });
  });

  describe('parameter validation', () => {
    const rpc = buildRpc({ assetName: 'ROOT', assetUtxoSatoshis: 1000000000 }).rpc;

    it('requires assetName', async () => {
      let error;
      try {
        await makeBuilder(rpc, { recipients: [{ address: RECIPIENT, amount: 1 }] }).build();
      } catch (err) { error = err; }
      expect(error.message).to.include('assetName is required');
    });

    it('requires a non-empty recipients array', async () => {
      let error;
      try {
        await makeBuilder(rpc, { assetName: 'ROOT', recipients: [] }).build();
      } catch (err) { error = err; }
      expect(error.message).to.include('recipients is required');
    });

    it('rejects amount <= 0', async () => {
      let error;
      try {
        await makeBuilder(rpc, {
          assetName: 'ROOT',
          recipients: [{ address: RECIPIENT, amount: 0 }],
        }).build();
      } catch (err) { error = err; }
      expect(error.message).to.include('greater than 0');
    });
  });

  describe('NeuraiAssets.transferAsset wiring', () => {
    it('exposes transferAsset() that builds via TransferBuilder', async () => {
      const { rpc, getCapturedOutputs } = buildRpc({
        assetName: 'ROOT',
        assetUtxoSatoshis: 1000000000,
      });

      const assets = new NeuraiAssets(rpc, {
        network: 'xna-test',
        addresses: [TEST_ADDRESS],
        changeAddress: TEST_ADDRESS,
        toAddress: TEST_ADDRESS,
      });

      const result = await assets.transferAsset({
        assetName: 'ROOT',
        recipients: [{ address: RECIPIENT, amount: 2 }],
      });

      expect(result.operationType).to.equal('TRANSFER');
      expect(transferAmount(getCapturedOutputs(), RECIPIENT, 'ROOT')).to.equal(2);
    });
  });
});
