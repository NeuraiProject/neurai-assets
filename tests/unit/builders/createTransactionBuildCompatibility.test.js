/**
 * The canonical contract, end to end.
 *
 * For every discriminant the library exposes: build it through the public
 * NeuraiAssets API, hand `result.createTransactionBuild` to
 * `createFromOperation` WITHOUT adapting anything, and read the resulting raw
 * transaction back to check the outputs the chain will see.
 *
 * The matrix is 17 canonical discriminants: 14 non-transfer methods producing
 * 15 discriminants (createQualifier splits into ISSUE_QUALIFIER /
 * ISSUE_SUB_QUALIFIER), plus the two variants of transferAsset.
 */

const { expect } = require('chai');
const { createFromOperation } = require('@neuraiproject/neurai-create-transaction');
const NeuraiAssets = require('../../../src/NeuraiAssets');
const { ADDR, PQ_ADDR } = require('../../fixtures/addresses');
const { parseUnsignedOutputs, assetPayloads, asciiHex } = require('../../fixtures/txParser');
const { createAssetRpc } = require('../../fixtures/assetRpc');

const NETWORK = 'xna-test';

function assets(rpc, overrides = {}) {
  return new NeuraiAssets(rpc, {
    network: NETWORK,
    addresses: [ADDR[0]],
    changeAddress: ADDR[0],
    toAddress: ADDR[1],
    ...overrides
  });
}

/** Standard wallet: plenty of XNA, and whatever owner/qualifier tokens are needed. */
function wallet(extra = {}) {
  return createAssetRpc({
    xnaUtxos: [
      { txid: 'a1'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 500000 * 1e8 }
    ],
    assetMarker: 'xna',
    ...extra
  });
}

function ownerUtxo(assetName, index = 1) {
  return {
    txid: 'b2'.repeat(32),
    outputIndex: index,
    address: ADDR[0],
    assetName,
    satoshis: 1e8
  };
}

/**
 * Every scenario: how to build it, and what the chain must end up seeing.
 * `expected.payloads` lists [assetName, rawAmount] pairs that must appear.
 */
const SCENARIOS = [
  {
    discriminant: 'ISSUE_ROOT',
    build: () => assets(wallet()).createRootAsset({
      assetName: 'ROOTX', quantity: 1000, units: 2
    }),
    expected: { payloads: [['ROOTX', 100000000000n], ['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'ISSUE_SUB',
    build: () => assets(wallet({
      assetMap: { PARENT: { amount: 10, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('PARENT!')]
    })).createSubAsset({ assetName: 'PARENT/CHILD', quantity: 5, units: 0 }),
    expected: { payloads: [['PARENT/CHILD', 500000000n], ['PARENT!', 100000000n]] }
  },
  {
    discriminant: 'ISSUE_DEPIN',
    build: () => assets(wallet()).createDepinAsset({
      assetName: '&SENSOR', quantity: 1
    }),
    expected: { payloads: [['&SENSOR', 100000000n], ['&SENSOR!', 100000000n]] }
  },
  {
    discriminant: 'ISSUE_UNIQUE',
    build: () => assets(wallet({
      assetMap: { ROOTX: { amount: 1000, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).createUniqueAssets({ rootName: 'ROOTX', assetTags: ['ONE', 'TWO'] }),
    expected: { payloads: [['ROOTX#ONE', 100000000n], ['ROOTX#TWO', 100000000n], ['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'ISSUE_QUALIFIER',
    build: () => assets(wallet()).createQualifier({
      qualifierName: '#KYC', quantity: 5
    }),
    expected: { payloads: [['#KYC', 500000000n]] }
  },
  {
    discriminant: 'ISSUE_SUB_QUALIFIER',
    build: () => assets(wallet({
      assetMap: { '#KYC': { amount: 10, units: 0, reissuable: 0 } },
      ownerUtxos: [{ ...ownerUtxo('#KYC'), satoshis: 10 * 1e8 }]
    })).createQualifier({ qualifierName: '#KYC/#EU', quantity: 3 }),
    expected: { payloads: [['#KYC/#EU', 300000000n]] }
  },
  {
    discriminant: 'ISSUE_RESTRICTED',
    build: () => assets(wallet({
      assetMap: { ROOTX: { amount: 1000, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).createRestrictedAsset({
      assetName: '$ROOTX', quantity: 100, units: 0, verifierString: '#KYC'
    }),
    expected: { payloads: [['$ROOTX', 10000000000n], ['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'REISSUE',
    build: () => assets(wallet({
      assetMap: { ROOTX: { amount: 1000, units: 2, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).reissueAsset({ assetName: 'ROOTX', quantity: 4.35 }),
    expected: { payloads: [['ROOTX', 435000000n], ['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'REISSUE_RESTRICTED',
    build: () => assets(wallet({
      assetMap: { $ROOTX: { amount: 100, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).reissueRestrictedAsset({
      assetName: '$ROOTX', quantity: 7, changeVerifier: true, newVerifier: '#KYC'
    }),
    expected: { payloads: [['$ROOTX', 700000000n], ['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'TAG_ADDRESSES',
    build: () => assets(wallet({
      assetMap: { '#KYC': { amount: 10, units: 0, reissuable: 0 } },
      ownerUtxos: [{ ...ownerUtxo('#KYC'), satoshis: 10 * 1e8 }]
    })).tagAddresses({ qualifierName: '#KYC', addresses: [ADDR[2]] }),
    expected: { payloads: [['#KYC', 1000000000n]] }
  },
  {
    discriminant: 'UNTAG_ADDRESSES',
    build: () => assets(wallet({
      assetMap: { '#KYC': { amount: 10, units: 0, reissuable: 0 } },
      ownerUtxos: [{ ...ownerUtxo('#KYC'), satoshis: 10 * 1e8 }]
    })).untagAddresses({ qualifierName: '#KYC', addresses: [ADDR[2]] }),
    expected: { payloads: [['#KYC', 1000000000n]] }
  },
  {
    discriminant: 'FREEZE_ADDRESSES',
    build: () => assets(wallet({
      assetMap: { $ROOTX: { amount: 100, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).freezeAddresses({ assetName: '$ROOTX', addresses: [ADDR[2]] }),
    expected: { payloads: [['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'UNFREEZE_ADDRESSES',
    build: () => assets(wallet({
      assetMap: { $ROOTX: { amount: 100, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).unfreezeAddresses({ assetName: '$ROOTX', addresses: [ADDR[2]] }),
    expected: { payloads: [['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'FREEZE_ASSET',
    build: () => assets(wallet({
      assetMap: { $ROOTX: { amount: 100, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).freezeAssetGlobally({ assetName: '$ROOTX' }),
    expected: { payloads: [['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'UNFREEZE_ASSET',
    build: () => assets(wallet({
      assetMap: { $ROOTX: { amount: 100, units: 0, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).unfreezeAssetGlobally({ assetName: '$ROOTX' }),
    expected: { payloads: [['ROOTX!', 100000000n]] }
  },
  {
    discriminant: 'STANDARD_TRANSFER',
    build: () => assets(wallet({
      ownerUtxos: [{
        txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0],
        assetName: 'ROOTX', satoshis: 1000 * 1e8
      }]
    })).transferAsset({ assetName: 'ROOTX', recipients: [{ address: ADDR[1], amount: 5 }] }),
    expected: { payloads: [['ROOTX', 500000000n], ['ROOTX', 99500000000n]] }
  },
  {
    discriminant: 'TRANSFER_DEPIN',
    build: () => assets(wallet({
      ownerUtxos: [
        { txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0], assetName: '&SENSOR', satoshis: 1000 * 1e8 },
        ownerUtxo('&SENSOR!', 3)
      ]
    })).transferAsset({ assetName: '&SENSOR', recipients: [{ address: ADDR[1], amount: 5 }] }),
    expected: { payloads: [['&SENSOR', 500000000n], ['&SENSOR', 99500000000n], ['&SENSOR!', 100000000n]] }
  }
];

describe('createTransactionBuild contract', () => {
  it('covers 17 canonical discriminants', () => {
    expect(SCENARIOS).to.have.length(17);
    expect(new Set(SCENARIOS.map(s => s.discriminant)).size).to.equal(17);
  });

  SCENARIOS.forEach(scenario => {
    describe(scenario.discriminant, () => {
      let result;
      let outputs;

      before(async () => {
        result = await scenario.build();
        // The whole point: no adaptation between the two calls.
        outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
      });

      it('exposes createTransactionBuild with the canonical discriminant', () => {
        expect(result.createTransactionBuild).to.be.an('object');
        expect(result.createTransactionBuild.operationType).to.equal(scenario.discriminant);
      });

      it('serializes without adaptation and produces the expected asset payloads', () => {
        const payloads = assetPayloads(outputs);
        scenario.expected.payloads.forEach(([assetName, amountRaw]) => {
          const match = payloads.find(p => p.assetName === assetName && p.amountRaw === amountRaw);
          expect(
            match,
            `missing payload ${assetName} = ${amountRaw}; got ` +
            JSON.stringify(payloads.map(p => `${p.assetName}=${p.amountRaw}`))
          ).to.not.equal(undefined);
        });
      });

      it('carries the node marker on every asset output', () => {
        expect(result.createTransactionBuild.params.assetMarker).to.equal('xna');
        assetPayloads(outputs).forEach(payload => {
          expect(payload.marker).to.equal('xna');
        });
      });

      it('emits no display amount under a *Raw / *Sats name', () => {
        const params = result.createTransactionBuild.params;
        Object.entries(params).forEach(([key, value]) => {
          if (/Raw$|Sats$/.test(key) && value !== undefined) {
            expect(typeof value, `${key} must be a bigint`).to.equal('bigint');
          }
        });
        (params.transfers || []).forEach(transfer => {
          expect(typeof transfer.amountRaw).to.equal('bigint');
        });
        (params.payments || []).forEach(payment => {
          expect(typeof payment.valueSats).to.equal('bigint');
        });
      });

      it('keeps the deprecated localRawBuild available', () => {
        expect(result.localRawBuild).to.be.an('object');
        expect(result.localRawBuild.params.inputs).to.be.an('array');
      });

      it('spends every outpoint at most once', () => {
        const keys = result.createTransactionBuild.params.inputs.map(i => `${i.txid}:${i.vout}`);
        expect(new Set(keys).size, `duplicate outpoint in ${JSON.stringify(keys)}`).to.equal(keys.length);
      });
    });
  });
});

describe('canonical transfer specifics', () => {
  it('DePIN emits exactly one owner escort and never lists it in transfers', async () => {
    const result = await assets(wallet({
      ownerUtxos: [
        { txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0], assetName: '&SENSOR', satoshis: 1000 * 1e8 },
        ownerUtxo('&SENSOR!', 3)
      ]
    })).transferAsset({ assetName: '&SENSOR', recipients: [{ address: ADDR[1], amount: 5 }] });

    const transfers = result.createTransactionBuild.params.transfers;
    expect(transfers.every(t => t.assetName === '&SENSOR')).to.equal(true);

    const outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
    const escorts = assetPayloads(outputs).filter(p => p.assetName === '&SENSOR!');
    expect(escorts).to.have.length(1);
    expect(escorts[0].amountRaw).to.equal(100000000n);
  });

  it('DePIN uses the physical order transfers -> owner escort -> XNA change', async () => {
    const result = await assets(wallet({
      ownerUtxos: [
        { txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0], assetName: '&SENSOR', satoshis: 1000 * 1e8 },
        ownerUtxo('&SENSOR!', 3)
      ]
    })).transferAsset({ assetName: '&SENSOR', recipients: [{ address: ADDR[1], amount: 5 }] });

    const outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
    const kinds = outputs.map(output => {
      const payload = assetPayloads([output])[0];
      if (!payload) return 'xna';
      return payload.assetName === '&SENSOR!' ? 'owner' : 'transfer';
    });

    expect(kinds).to.deep.equal(['transfer', 'transfer', 'owner', 'xna']);
  });

  it('normal transfer carries the XNA change as a payment, not an envelope', async () => {
    const result = await assets(wallet({
      ownerUtxos: [{
        txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0],
        assetName: 'ROOTX', satoshis: 1000 * 1e8
      }]
    })).transferAsset({ assetName: 'ROOTX', recipients: [{ address: ADDR[1], amount: 5 }] });

    const params = result.createTransactionBuild.params;
    expect(params.payments).to.have.length(1);
    expect(params.payments[0].address).to.equal(ADDR[0]);
    expect(params.xnaChangeSats).to.equal(undefined);
  });

  it('omits the asset change when the inputs match the recipients exactly', async () => {
    const result = await assets(wallet({
      ownerUtxos: [{
        txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0],
        assetName: 'ROOTX', satoshis: 5 * 1e8
      }]
    })).transferAsset({ assetName: 'ROOTX', recipients: [{ address: ADDR[1], amount: 5 }] });

    expect(result.createTransactionBuild.params.transfers).to.have.length(1);
    expect(result.assetChange).to.equal(0);
  });

  it('splits across several recipients without drifting the asset change', async () => {
    const result = await assets(wallet({
      ownerUtxos: [{
        txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0],
        assetName: 'ROOTX', satoshis: 10 * 1e8
      }]
    })).transferAsset({
      assetName: 'ROOTX',
      recipients: [
        { address: ADDR[1], amount: 1.1 },
        { address: ADDR[2], amount: 2.2 },
        { address: ADDR[3], amount: 3.3 }
      ]
    });

    const transfers = result.createTransactionBuild.params.transfers;
    expect(transfers.map(t => t.amountRaw)).to.deep.equal([
      110000000n, 220000000n, 330000000n, 340000000n
    ]);
    const total = transfers.reduce((sum, t) => sum + t.amountRaw, 0n);
    expect(total).to.equal(1000000000n); // exactly the input, no lost satoshi
  });
});

describe('network normalization', () => {
  const DEPIN_UTXOS = {
    ownerUtxos: [
      { txid: 'c3'.repeat(32), outputIndex: 2, address: ADDR[0], assetName: '&SENSOR', satoshis: 1000 * 1e8 },
      ownerUtxo('&SENSOR!', 3)
    ]
  };

  ['xna-test', 'testnet', 'regtest', 'xna-pq-test', 'testnet-pq'].forEach(network => {
    it(`accepts the testnet alias "${network}" and normalizes it`, async () => {
      const result = await assets(wallet(DEPIN_UTXOS), { network })
        .transferAsset({ assetName: '&SENSOR', recipients: [{ address: ADDR[1], amount: 5 }] });
      expect(result.createTransactionBuild.params.network).to.equal('xna-test');
      expect(() => createFromOperation(result.createTransactionBuild)).to.not.throw();
    });
  });

  ['xna', 'mainnet', 'xna-pq', 'mainnet-pq'].forEach(network => {
    it(`rejects the mainnet alias "${network}" at the DePIN guard`, async () => {
      // 'mainnet' is the case that mattered: create-transaction's
      // resolveNetworkFamily treats any unknown label as testnet, so passing
      // the alias through unnormalized would slip past this guard.
      const result = await assets(wallet(DEPIN_UTXOS), { network })
        .transferAsset({ assetName: '&SENSOR', recipients: [{ address: ADDR[1], amount: 5 }] });
      expect(result.createTransactionBuild.params.network).to.equal('xna');
      expect(() => createFromOperation(result.createTransactionBuild))
        .to.throw(/only available on testnet\/regtest/);
    });
  });

  it('normalizes ISSUE_DEPIN too', async () => {
    const result = await assets(wallet(), { network: 'regtest' })
      .createDepinAsset({ assetName: '&SENSOR', quantity: 1 });
    expect(result.createTransactionBuild.params.network).to.equal('xna-test');
  });
});

describe('marker propagation', () => {
  it('stamps rvn on every asset output when the node reports it', async () => {
    const result = await assets(wallet({ assetMarker: 'rvn' }))
      .createRootAsset({ assetName: 'ROOTX', quantity: 10, units: 0 });
    const outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
    const payloads = assetPayloads(outputs);
    expect(payloads).to.have.length(2);
    payloads.forEach(payload => expect(payload.marker).to.equal('rvn'));
  });

  it('keeps the RPC output path untouched by the marker', async () => {
    // createrawtransaction stamps the marker itself; the JSON must stay display.
    const result = await assets(wallet({ assetMarker: 'xna' }))
      .createRootAsset({ assetName: 'ROOTX', quantity: 1000, units: 2 });
    const issue = result.outputs
      .map(o => Object.values(o)[0])
      .find(v => v && v.issue);
    expect(issue.issue.asset_quantity).to.equal(1000);
    expect(result.createTransactionBuild.params.quantityRaw).to.equal(100000000000n);
  });
});

describe('PQ (AuthScript) destinations', () => {
  it('serializes a transfer to a PQ address', async () => {
    const result = await assets(wallet({
      xnaUtxos: [{
        txid: 'a1'.repeat(32), outputIndex: 0, address: PQ_ADDR[0],
        script: '5120' + 'ab'.repeat(32), satoshis: 500000 * 1e8
      }],
      ownerUtxos: [{
        txid: 'c3'.repeat(32), outputIndex: 2, address: PQ_ADDR[0],
        script: '5120' + 'cd'.repeat(32), assetName: 'ROOTX', satoshis: 1000 * 1e8
      }]
    }), { network: 'xna-pq-test', addresses: [PQ_ADDR[0]], changeAddress: PQ_ADDR[0] })
      .transferAsset({ assetName: 'ROOTX', recipients: [{ address: PQ_ADDR[1], amount: 5 }] });

    const outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
    const payloads = assetPayloads(outputs);
    expect(payloads.map(p => p.amountRaw)).to.deep.equal([500000000n, 99500000000n]);
    // AuthScript destinations are OP_1 <32B>: 0x51 0x20 ...
    expect(outputs.some(o => o.scriptHex.startsWith('5120'))).to.equal(true);
  });
});

describe('quantity precision reaching the chain', () => {
  it('encodes a fractional quantity exactly', async () => {
    const result = await assets(wallet({
      assetMap: { ROOTX: { amount: 1000, units: 2, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    })).reissueAsset({ assetName: 'ROOTX', quantity: 4.35 });

    const outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
    const reissue = assetPayloads(outputs).find(p => p.assetName === 'ROOTX');
    expect(reissue.amountRaw).to.equal(435000000n);
  });

  it('rejects a quantity the asset precision cannot represent', async () => {
    let failed = null;
    try {
      await assets(wallet({
        assetMap: { ROOTX: { amount: 1000, units: 0, reissuable: 1 } },
        ownerUtxos: [ownerUtxo('ROOTX!')]
      })).reissueAsset({ assetName: 'ROOTX', quantity: 1.5 });
    } catch (error) {
      failed = error;
    }
    expect(failed, 'build must reject a non-representable quantity').to.not.equal(null);
  });

  it('carries a supply above MAX_SAFE_INTEGER once scaled', async () => {
    const result = await assets(wallet()).createRootAsset({
      assetName: 'BIGX', quantity: 21000000000, units: 8
    });
    expect(result.createTransactionBuild.params.quantityRaw).to.equal(2100000000000000000n);
    const outputs = parseUnsignedOutputs(createFromOperation(result.createTransactionBuild).rawTx);
    const issue = assetPayloads(outputs).find(p => p.assetName === 'BIGX');
    expect(issue.amountRaw).to.equal(2100000000000000000n);
    expect(issue.amountRaw > BigInt(Number.MAX_SAFE_INTEGER)).to.equal(true);
  });
});

describe('asciiHex helper sanity', () => {
  it('encodes as the payload does', () => {
    expect(asciiHex('ROOTX')).to.equal('524f4f5458');
  });
});

describe('reissue keeps the asset units (create-transaction 0.8.0)', () => {
  // This library has no API to change an asset's units, so its reissue builds
  // must say "keep them" — encoded as 0xff since create-transaction 0.8.0 —
  // rather than echoing the value read from getassetdata. Echoing it would say
  // "set units to N", and a stale read (the asset reissued to a higher
  // precision in between) would ask the node to lower them, which it rejects
  // with `unit must be larger than current unit selection`.
  const unitsByteOf = build =>
    createFromOperation(build).outputs.at(-1).scriptPubKeyHex.slice(-6, -4);

  function reissueWallet(units) {
    return wallet({
      assetMap: {
        ROOTX: { amount: 1000, units, reissuable: 1 },
        $ROOTX: { amount: 100, units, reissuable: 1 }
      },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    });
  }

  [0, 2, 8].forEach(units => {
    it(`omits units for an asset with units=${units}, encoding 0xff`, async () => {
      const result = await assets(reissueWallet(units))
        .reissueAsset({ assetName: 'ROOTX', quantity: 4 });

      expect(result.createTransactionBuild.params.units).to.equal(undefined);
      expect(unitsByteOf(result.createTransactionBuild)).to.equal('ff');
    });
  });

  it('does the same for REISSUE_RESTRICTED', async () => {
    const result = await assets(reissueWallet(0))
      .reissueRestrictedAsset({ assetName: '$ROOTX', quantity: 7 });

    expect(result.createTransactionBuild.params.units).to.equal(undefined);
    expect(unitsByteOf(result.createTransactionBuild)).to.equal('ff');
  });

  it('still validates the quantity against the asset precision', async () => {
    // The units read from the chain are not sent, but they are still used:
    // 1.5 does not fit an asset with units=0.
    let failed = null;
    try {
      await assets(reissueWallet(0)).reissueAsset({ assetName: 'ROOTX', quantity: 1.5 });
    } catch (error) {
      failed = error;
    }
    expect(failed, 'must reject a quantity the precision cannot represent').to.not.equal(null);
    expect(failed.message).to.match(/units=0/);
  });

  it('leaves issuance alone: a new asset still declares its units', async () => {
    // A new asset has no units to keep, so ISSUE_ROOT must state them.
    const result = await assets(wallet())
      .createRootAsset({ assetName: 'ROOTX', quantity: 1000, units: 2 });
    expect(result.createTransactionBuild.params.units).to.equal(2);

    const issue = createFromOperation(result.createTransactionBuild).outputs.at(-1).scriptPubKeyHex;
    // ... <amount:8B> <units:1B> <reissuable:1B> <has_ipfs:1B> OP_DROP
    expect(issue.slice(-8, -6)).to.equal('02');
  });
});

describe('reissue builds locally (1.5.0)', () => {
  // The node's createrawtransaction has no units field for a reissue and fills
  // in 0, so it refuses any asset with units > 0. Assets therefore builds these
  // with createFromOperation instead — which also means the RPC output
  // envelope and the raw transaction stop describing the same output list.
  function reissueWallet(units) {
    return wallet({
      assetMap: { ROOTX: { amount: 1000, units, reissuable: 1 } },
      ownerUtxos: [ownerUtxo('ROOTX!')]
    });
  }

  it('reports buildStrategy "local-builder" and never calls createrawtransaction', async () => {
    const calls = [];
    const rpc = createAssetRpc({
      assetMarker: 'xna',
      calls,
      assetMap: { ROOTX: { amount: 1000, units: 2, reissuable: 1 } },
      xnaUtxos: [{ txid: 'a1'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 500000 * 1e8 }],
      ownerUtxos: [ownerUtxo('ROOTX!')]
    });

    const result = await assets(rpc).reissueAsset({ assetName: 'ROOTX', quantity: 4.35 });

    expect(result.buildStrategy).to.equal('local-builder');
    expect(calls).to.not.include('createrawtransaction');
    expect(result.rawTx).to.match(/^[0-9a-f]+$/);
  });

  it('builds a units=2 reissue that the RPC path could not', async () => {
    // With units > 0 the node would answer
    // `unit must be larger than current unit selection`.
    const result = await assets(reissueWallet(2)).reissueAsset({ assetName: 'ROOTX', quantity: 4.35 });
    const payloads = assetPayloads(parseUnsignedOutputs(result.rawTx));
    const reissue = payloads.find(p => p.type === 'r');
    expect(reissue.assetName).to.equal('ROOTX');
    expect(reissue.amountRaw).to.equal(435000000n);
  });

  it('emits the owner escort in rawTx, which the RPC envelope omits', async () => {
    // The divergence documented on NeuraiAssetsBuildResult.outputs: the node
    // would have generated the owner return itself, so the envelope has one
    // entry fewer than the transaction actually has vouts.
    const result = await assets(reissueWallet(2)).reissueAsset({ assetName: 'ROOTX', quantity: 4.35 });
    const vouts = parseUnsignedOutputs(result.rawTx);

    expect(result.outputs).to.have.length(3);
    expect(vouts).to.have.length(4);

    const owners = assetPayloads(vouts).filter(p => p.assetName === 'ROOTX!');
    expect(owners, 'rawTx must carry exactly one owner escort').to.have.length(1);
  });

  it('keeps burn and change metadata correct despite that divergence', async () => {
    const result = await assets(reissueWallet(2)).reissueAsset({ assetName: 'ROOTX', quantity: 4.35 });
    expect(result.burnAmount).to.equal(200);
    expect(result.burnAddress).to.be.a('string');
    expect(result.changeAddress).to.equal(ADDR[0]);
    expect(result.changeAmount).to.be.a('number');
  });

  it('leaves the other operations on the RPC path', async () => {
    const issued = await assets(wallet()).createRootAsset({
      assetName: 'ROOTX', quantity: 10, units: 0
    });
    expect(issued.buildStrategy).to.equal('rpc-node');
  });
});
