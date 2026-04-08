const { expect } = require('chai');
const IssueUniqueBuilder = require('../../../src/builders/IssueUniqueBuilder');
const ReissueBuilder = require('../../../src/builders/ReissueBuilder');
const ReissueRestrictedBuilder = require('../../../src/builders/ReissueRestrictedBuilder');
const { createFromOperation } = require('@neuraiproject/neurai-create-transaction');

const LEGACY_TEST_ADDRESS = 't7pvKtaVzbcsUijMT3z8KA4bkF1XxUiKqN';

function asciiHex(value) {
  return Buffer.from(value, 'ascii').toString('hex');
}

function readVarInt(hex, offset) {
  const prefix = Number.parseInt(hex.slice(offset, offset + 2), 16);
  offset += 2;

  if (prefix < 0xfd) {
    return { value: prefix, offset };
  }

  if (prefix === 0xfd) {
    const value = Number.parseInt(hex.slice(offset + 2, offset + 4) + hex.slice(offset, offset + 2), 16);
    return { value, offset: offset + 4 };
  }

  if (prefix === 0xfe) {
    const bytes = hex.slice(offset, offset + 8).match(/../g).reverse().join('');
    return { value: Number.parseInt(bytes, 16), offset: offset + 8 };
  }

  throw new Error('64-bit CompactSize values are not expected in these tests');
}

function parseUnsignedOutputs(rawTx) {
  let offset = 8; // version
  const vinCount = readVarInt(rawTx, offset);
  offset = vinCount.offset;

  for (let index = 0; index < vinCount.value; index += 1) {
    offset += 64; // txid
    offset += 8; // vout
    const scriptLength = readVarInt(rawTx, offset);
    offset = scriptLength.offset + scriptLength.value * 2;
    offset += 8; // sequence
  }

  const voutCount = readVarInt(rawTx, offset);
  offset = voutCount.offset;
  const outputs = [];

  for (let index = 0; index < voutCount.value; index += 1) {
    const valueHex = rawTx.slice(offset, offset + 16);
    offset += 16;
    const scriptLength = readVarInt(rawTx, offset);
    offset = scriptLength.offset;
    const scriptHex = rawTx.slice(offset, offset + scriptLength.value * 2);
    offset += scriptLength.value * 2;
    outputs.push({ valueHex, scriptHex });
  }

  return outputs;
}

function countScriptsContaining(outputs, fragment) {
  return outputs.filter(output => output.scriptHex.includes(fragment)).length;
}

function createRpc({ assetMap = {}, xnaUtxos = [], ownerUtxos = [] }) {
  return async (method, params = []) => {
    switch (method) {
      case 'getassetdata': {
        const assetName = params[0];
        if (Object.prototype.hasOwnProperty.call(assetMap, assetName)) {
          return assetMap[assetName];
        }
        throw new Error('asset not found');
      }

      case 'getaddressutxos': {
        const query = params[0] || {};
        if (query.assetName) {
          return ownerUtxos.filter(utxo => utxo.assetName === query.assetName);
        }
        return xnaUtxos;
      }

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
}

describe('Local Raw Build Compatibility', () => {
  it('should expose UNIQUE metadata that serializes with one owner output and one issue output per NFT', async () => {
    const rpc = createRpc({
      assetMap: {
        ROOT: { amount: 1000, reissuable: 1, units: 0 }
      },
      xnaUtxos: [
        {
          txid: '01'.repeat(32),
          outputIndex: 0,
          address: LEGACY_TEST_ADDRESS,
          satoshis: 5000000000000
        }
      ],
      ownerUtxos: [
        {
          txid: '02'.repeat(32),
          outputIndex: 1,
          address: LEGACY_TEST_ADDRESS,
          assetName: 'ROOT!',
          satoshis: 100000000
        }
      ]
    });

    const builder = new IssueUniqueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [LEGACY_TEST_ADDRESS],
      changeAddress: LEGACY_TEST_ADDRESS,
      toAddress: LEGACY_TEST_ADDRESS,
      rootName: 'ROOT',
      assetTags: ['ONE', 'TWO']
    });

    const result = await builder.build();
    const built = createFromOperation(result.localRawBuild);
    const outputs = parseUnsignedOutputs(built.rawTx);

    expect(result.operationType).to.equal('ISSUE_UNIQUE');
    expect(result.localRawBuild.params.ownerTokenAddress).to.equal(LEGACY_TEST_ADDRESS);
    expect(outputs).to.have.length(5);
    expect(countScriptsContaining(outputs, asciiHex('ROOT!'))).to.equal(1);
    expect(countScriptsContaining(outputs, asciiHex('ROOT#ONE'))).to.equal(1);
    expect(countScriptsContaining(outputs, asciiHex('ROOT#TWO'))).to.equal(1);
  });

  it('should expose REISSUE metadata that serializes with the owner return output', async () => {
    const rpc = createRpc({
      assetMap: {
        ROOT: { amount: 10, reissuable: 1, units: 0 }
      },
      xnaUtxos: [
        {
          txid: '03'.repeat(32),
          outputIndex: 0,
          address: LEGACY_TEST_ADDRESS,
          satoshis: 5000000000000
        }
      ],
      ownerUtxos: [
        {
          txid: '04'.repeat(32),
          outputIndex: 1,
          address: LEGACY_TEST_ADDRESS,
          assetName: 'ROOT!',
          satoshis: 100000000
        }
      ]
    });

    const builder = new ReissueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [LEGACY_TEST_ADDRESS],
      changeAddress: LEGACY_TEST_ADDRESS,
      toAddress: LEGACY_TEST_ADDRESS,
      assetName: 'ROOT',
      quantity: 4
    });

    const result = await builder.build();
    const built = createFromOperation(result.localRawBuild);
    const outputs = parseUnsignedOutputs(built.rawTx);

    expect(result.operationType).to.equal('REISSUE');
    expect(result.localRawBuild.params.ownerChangeAddress).to.equal(LEGACY_TEST_ADDRESS);
    expect(outputs).to.have.length(4);
    expect(countScriptsContaining(outputs, asciiHex('ROOT!'))).to.equal(1);
    expect(countScriptsContaining(outputs, '72766e72')).to.equal(1);
  });

  it('should expose REISSUE_RESTRICTED metadata that serializes owner and verifier outputs together', async () => {
    const rpc = createRpc({
      assetMap: {
        '$ROOT': { amount: 10, reissuable: 1, units: 0 }
      },
      xnaUtxos: [
        {
          txid: '05'.repeat(32),
          outputIndex: 0,
          address: LEGACY_TEST_ADDRESS,
          satoshis: 5000000000000
        }
      ],
      ownerUtxos: [
        {
          txid: '06'.repeat(32),
          outputIndex: 1,
          address: LEGACY_TEST_ADDRESS,
          assetName: 'ROOT!',
          satoshis: 100000000
        }
      ]
    });

    const builder = new ReissueRestrictedBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [LEGACY_TEST_ADDRESS],
      changeAddress: LEGACY_TEST_ADDRESS,
      toAddress: LEGACY_TEST_ADDRESS,
      assetName: '$ROOT',
      quantity: 4,
      changeVerifier: true,
      newVerifier: '#KYC'
    });

    const result = await builder.build();
    const built = createFromOperation(result.localRawBuild);
    const outputs = parseUnsignedOutputs(built.rawTx);

    expect(result.operationType).to.equal('REISSUE_RESTRICTED');
    expect(result.localRawBuild.params.ownerChangeAddress).to.equal(LEGACY_TEST_ADDRESS);
    expect(result.localRawBuild.params.verifierString).to.equal('#KYC');
    expect(outputs).to.have.length(5);
    expect(countScriptsContaining(outputs, asciiHex('ROOT!'))).to.equal(1);
    expect(countScriptsContaining(outputs, asciiHex('#KYC'))).to.equal(1);
    expect(countScriptsContaining(outputs, '72766e72')).to.equal(1);
  });
});
