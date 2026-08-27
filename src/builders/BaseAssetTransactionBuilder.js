/**
 * Base Asset Transaction Builder
 * Abstract base class for all transaction builders
 *
 * Provides common functionality:
 * - UTXO selection
 * - Fee estimation
 * - Output ordering
 * - Raw transaction creation
 * - Validation
 *
 * Subclasses must implement:
 * - validateParams(params)
 * - build()
 */

const { rpcErrorMessage } = require('../utils/rpcErrorMessage');
const { createFromOperation } = require('@neuraiproject/neurai-create-transaction');
const { BurnManager, OwnerTokenManager, UTXOSelector, OutputOrderer } = require('../managers');
const { AssetNameValidator, AmountValidator } = require('../validators');
const { getNetworkConfig } = require('../constants/networks');
const {
  assetAmountToRaw,
  xnaAmountToSats,
  formatRawAsDecimal,
  rawToDisplayNumber,
  toProtocolInteger,
  sumProtocolIntegers
} = require('../utils/assetAmount');

/** Outputs below this are dust and are dropped instead of created. */
const DUST_SATS = 1n;

/**
 * Backstop for the funding loop. Each round consumes at least one new outpoint,
 * so a wallet needs more than this many UTXOs in a single transaction before
 * the limit is even reachable; it exists so a pathological fee curve fails
 * with a clear message instead of looping.
 */
const MAX_FUNDING_ROUNDS = 32;

class BaseAssetTransactionBuilder {
  /**
   * @param {Function} rpc - RPC function
   * @param {string} network - Network type ('xna' or 'xna-test')
   * @param {string[]|Function} addresses - Wallet addresses or function that returns addresses
   * @param {object} params - Transaction parameters
   */
  constructor(rpc, networkOrParams, addresses, params) {
    if (!rpc || typeof rpc !== 'function') {
      throw new Error('RPC function is required');
    }

    // Support both (rpc, network, addresses, params) and (rpc, params) calling forms.
    // NeuraiAssets passes a single merged params object as the second argument.
    let network, actualAddresses, actualParams;
    if (
      typeof networkOrParams === 'object' &&
      networkOrParams !== null &&
      !Array.isArray(networkOrParams) &&
      addresses === undefined
    ) {
      network = networkOrParams.network;
      actualAddresses = networkOrParams.walletAddresses || networkOrParams.addresses;
      actualParams = networkOrParams;
    } else {
      network = networkOrParams;
      actualAddresses = addresses;
      actualParams = params;
    }

    if (!network) {
      throw new Error('Network is required');
    }

    // Addresses can be an array or a function that returns addresses
    if (typeof actualAddresses === 'function') {
      this.getAddresses = actualAddresses;
    } else if (Array.isArray(actualAddresses)) {
      this.getAddresses = () => actualAddresses;
    } else {
      throw new Error('Addresses must be an array or a function');
    }

    this.rpc = rpc;
    this.network = network;
    this.params = actualParams || {};

    // Initialize managers
    this.burnManager = new BurnManager(network);
    this.ownerTokenManager = new OwnerTokenManager(rpc);
    this.utxoSelector = new UTXOSelector(rpc);
    this.outputOrderer = new OutputOrderer();

    // `estimatesmartfee` is called twice per build (pre-selection guess and
    // post-selection recompute). The fee rate is stable for the duration of
    // a single build, so cache the first lookup and reuse it.
    this._feeRatePromise = null;

    // NIP-040 marker for the localRawBuild metadata; resolved once per build.
    this._assetMarkerPromise = null;
  }

  /**
   * Get wallet addresses
   * @returns {string[]} Array of addresses
   */
  async _getAddresses() {
    const addresses = await this.getAddresses();
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('No addresses available');
    }
    return addresses;
  }

  /**
   * Validate transaction parameters
   * Must be implemented by subclasses
   * @param {object} params - Parameters to validate
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    throw new Error('validateParams must be implemented by subclass');
  }

  /**
   * Build the transaction
   * Must be implemented by subclasses
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    throw new Error('build must be implemented by subclass');
  }

  /**
   * Estimate transaction fee.
   *
   * Both arguments accept either a count (legacy) or an array of descriptors
   * that lets the underlying estimator distinguish PQ AuthScript inputs/outputs
   * from legacy P2PKH ones. Pass arrays whenever you have actual UTXOs and
   * output addresses on hand — counts produce a legacy-only estimate.
   *
   * @param {number|Array} inputs - Input count or array of UTXO-like descriptors
   * @param {number|Array} outputs - Output count or array of address-like descriptors
   * @returns {Promise<number>} Estimated fee in XNA
   */
  async estimateFee(inputs, outputs) {
    if (!this._feeRatePromise) {
      this._feeRatePromise = this.utxoSelector.getFeeRate();
    }
    const feeRate = await this._feeRatePromise;
    return this.utxoSelector.estimateFee(inputs, outputs, feeRate);
  }

  /**
   * Select UTXOs for transaction
   * @param {number} xnaAmount - Required XNA amount (for fees + burn)
   * @param {string|null} assetName - Asset name if needed
   * @param {number} assetAmount - Asset amount if needed
   * @returns {Promise<object>} Selected UTXOs
   */
  async selectUTXOs(xnaAmount, assetName = null, assetAmount = 0, options = {}) {
    const addresses = await this._getAddresses();
    return this.utxoSelector.selectMixedUTXOs(
      addresses,
      xnaAmount,
      assetName,
      assetAmount,
      options
    );
  }

  /**
   * Estimate the transaction fee in exact satoshis.
   *
   * @param {number|Array} inputs - Input count or array of UTXO-like descriptors
   * @param {number|Array} outputs - Output count or array of address-like descriptors
   * @returns {Promise<bigint>} Estimated fee in satoshis
   */
  async estimateFeeSats(inputs, outputs) {
    if (!this._feeRatePromise) {
      this._feeRatePromise = this.utxoSelector.getFeeRate();
    }
    const feeRate = await this._feeRatePromise;
    return this.utxoSelector.estimateFeeSats(inputs, outputs, feeRate);
  }

  /**
   * Fund the XNA side of a transaction, exactly.
   *
   * Replaces the "estimate once, select once, top up with a `+0.001` cushion"
   * pattern that every builder carried. That pattern had three defects, all of
   * which only surface when the top-up branch actually runs — which depends on
   * the *value* of the selected UTXOs, not on the size of the transaction:
   *
   *   1. the second selection re-queried the node without excluding what the
   *      first one took, and the greedy order is deterministic, so it handed
   *      back the same largest outpoint and the transaction spent it twice;
   *   2. the fee was never recomputed, so the inputs added by the top-up were
   *      not paid for;
   *   3. the `+0.001 XNA` cushion did not pay for them either — it only
   *      enlarged the selection target and came back as change.
   *
   * Here each round excludes every outpoint already held, recomputes the fee
   * from the real (PQ-aware) descriptors of the full input set, and loops
   * until the funds cover burn + fee. Running out of funds throws
   * InsufficientFundsError from the selector; it never returns underfunded.
   *
   * @param {object} options
   * @param {Array} options.outputs - Output descriptors for the size estimate
   * @param {bigint} [options.burnSats] - Burn amount that the inputs must also cover
   * @param {Array} [options.extraInputs] - Non-XNA inputs already committed (asset, owner token)
   * @param {Array} [options.exclude] - Outpoints that must not be selected
   * @param {number} [options.initialInputHint] - Assumed XNA input count for the first estimate
   * @returns {Promise<{utxos: Array, totalSats: bigint, feeSats: bigint, changeSats: bigint, rounds: number}>}
   */
  async fundXnaInputs(options) {
    const {
      outputs,
      burnSats = 0n,
      extraInputs = [],
      exclude = [],
      initialInputHint = 1
    } = options;

    const addresses = await this._getAddresses();
    const excluded = UTXOSelector.toOutpointSet(exclude);
    // toOutpointSet returns the caller's Set untouched when it already is one;
    // copy so this method never mutates what it was handed.
    const held = new Set(excluded);

    const selected = [];
    let totalSats = 0n;
    // First estimate assumes `initialInputHint` legacy XNA inputs; the loop
    // corrects it as soon as the real descriptors are known.
    let feeSats = await this.estimateFeeSats(
      [...extraInputs, ...new Array(initialInputHint).fill({})],
      outputs
    );
    let rounds = 0;

    for (;;) {
      const requiredSats = burnSats + feeSats;
      if (totalSats >= requiredSats) {
        break;
      }

      if (rounds >= MAX_FUNDING_ROUNDS) {
        throw new Error(
          `XNA funding did not converge after ${MAX_FUNDING_ROUNDS} rounds ` +
          `(need ${formatRawAsDecimal(requiredSats)} XNA, hold ` +
          `${formatRawAsDecimal(totalSats)} XNA)`
        );
      }
      rounds += 1;

      const selection = await this.utxoSelector.selectBaseCurrencyUTXOs(
        addresses,
        null,
        0.1,
        { requiredSats: requiredSats - totalSats, exclude: held }
      );

      selection.utxos.forEach(utxo => {
        held.add(UTXOSelector.outpointKey(utxo));
        selected.push(utxo);
      });
      totalSats += selection.totalSats;

      // The fee must reflect every input it is paying for.
      feeSats = await this.estimateFeeSats([...extraInputs, ...selected], outputs);
    }

    return {
      utxos: selected,
      totalSats,
      feeSats,
      changeSats: totalSats - burnSats - feeSats,
      rounds
    };
  }

  /**
   * The network label understood by neurai-create-transaction.
   *
   * `this.network` accepts aliases (`mainnet`, `testnet`, `regtest`,
   * `mainnet-pq`, ...) that the serializer does not know. Its
   * `resolveNetworkFamily` treats every unrecognised value as testnet, so
   * passing the alias `'mainnet'` straight through would make a mainnet build
   * slip past the DePIN guard that correctly rejects `'xna'`.
   *
   * @returns {'xna'|'xna-test'} Canonical network label
   */
  canonicalNetwork() {
    return getNetworkConfig(this.network).baseNetwork;
  }

  /**
   * Build raw transaction using RPC
   * @param {Array} inputs - Transaction inputs
   * @param {object} outputs - Transaction outputs (must be ordered)
   * @returns {Promise<string>} Raw transaction hex
   */
  async buildRawTransaction(inputs, outputs) {
    try {
      // Format inputs for createrawtransaction
      const formattedInputs = inputs.map(input => ({
        txid: input.txid,
        vout: input.vout !== undefined ? input.vout : input.outputIndex
      }));

      // Call createrawtransaction
      const rawTx = await this.rpc('createrawtransaction', [
        formattedInputs,
        outputs
      ]);

      return rawTx;
    } catch (error) {
      throw new Error(`Failed to create raw transaction: ${rpcErrorMessage(error)}`);
    }
  }

  /**
   * Build the raw transaction locally from a canonical build, without the
   * node's `createrawtransaction`.
   *
   * The reissue builders use this instead of buildRawTransaction: the RPC's
   * `reissue` object has no field for units and the node fills in 0, so that
   * path rejects any asset whose units are above zero (`unit must be larger
   * than current unit selection`). The local codec encodes "keep the current
   * units" (0xff) — the same default the node's own `reissue` RPC uses — and
   * emits the same outputs the node would: owner-token return auto-generated,
   * operation output last.
   *
   * @param {{operationType: string, params: object}} createTransactionBuild -
   *   Canonical payload, as produced by buildCreateTransactionBuild
   * @returns {string} Raw transaction hex, ready for signing
   */
  buildRawTransactionLocally(createTransactionBuild) {
    try {
      return createFromOperation(createTransactionBuild).rawTx;
    } catch (error) {
      throw new Error(`Failed to create raw transaction locally: ${error.message}`);
    }
  }

  /**
   * Calculate change amount
   * @param {number} totalInput - Total input amount
   * @param {number} totalOutput - Total output amount (including fee)
   * @returns {number} Change amount
   */
  calculateChange(totalInput, totalOutput) {
    const change = totalInput - totalOutput;
    if (change < 0) {
      throw new Error('Insufficient funds: inputs < outputs');
    }
    return change;
  }

  /**
   * Get change address
   * Uses first address from wallet by default
   * Can be overridden by params.changeAddress
   * @returns {Promise<string>} Change address
   */
  async getChangeAddress() {
    if (this.params.changeAddress) {
      return this.params.changeAddress;
    }

    const addresses = await this._getAddresses();
    return addresses[0];
  }

  /**
   * Get recipient address
   * Uses first address from wallet if not specified
   * @returns {Promise<string>} Recipient address
   */
  async getToAddress() {
    if (this.params.toAddress) {
      return this.params.toAddress;
    }

    const addresses = await this._getAddresses();
    return addresses[0];
  }

  /**
   * Common validation for asset name
   * @param {string} assetName - Asset name to validate
   * @param {string} type - Expected type ('ROOT', 'SUB', etc.)
   */
  validateAssetName(assetName, type) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    switch (type) {
      case 'ROOT':
        AssetNameValidator.validateRoot(assetName, this.network);
        break;
      case 'SUB':
        AssetNameValidator.validateSub(assetName, this.network);
        break;
      case 'UNIQUE':
        AssetNameValidator.validateUnique(assetName, this.network);
        break;
      case 'QUALIFIER':
        AssetNameValidator.validateQualifier(assetName, this.network);
        break;
      case 'RESTRICTED':
        AssetNameValidator.validateRestricted(assetName, this.network);
        break;
      case 'DEPIN':
        AssetNameValidator.validateDepin(assetName, this.network);
        break;
      default:
        throw new Error(`Unknown asset type: ${type}`);
    }
  }

  /**
   * Common validation for amount and units
   * @param {number} quantity - Quantity to validate
   * @param {number} units - Units (decimal places)
   */
  validateAmount(quantity, units) {
    AmountValidator.validate(quantity, units);
  }

  /**
   * Build the JSON `asset_quantity` value for a `createrawtransaction`
   * output (issue / reissue / tag change_quantity / etc.).
   *
   * The chain parses this field with `AmountFromValue()` (Bitcoin-style
   * decimal-XNA → 10^8 sats), then validates that the resulting CAmount
   * is a multiple of `10^(8 - units)` via `CheckAmountWithUnits`
   * (assets.cpp). So:
   *
   *   - The JSON value MUST be the user-facing display amount
   *     (e.g. "1" for one token, "1.5" for one and a half tokens).
   *   - The lib must NOT pre-multiply by 10^8 or 10^units; the daemon
   *     does the 10^8 scaling itself, and any extra factor here lands
   *     duplicated and inflates the minted supply (or trips the
   *     ParseFixedPoint `exponent >= 18` cap → "Invalid amount (3)").
   *
   * History: pre-1.2.2 multiplied by 10^units (correct only for units=0
   * assets, inflated everything else by 10^units). v1.2.2 changed to
   * always 10^8 (correct only for units=8, inflated everything else by
   * 10^8 — e.g. reissuing 1 token of a units=0 asset minted 100,000,000).
   * The right answer is to send the value untouched.
   *
   * The `units` parameter is kept for API compatibility but is unused.
   *
   * @param {number} amount - User-facing asset amount
   * @param {number} units - Asset decimal places (unused; kept for API)
   * @returns {number} The user-facing amount, ready for the JSON output
   */
  toSatoshis(amount, units) {
    void units;
    return amount;
  }

  /**
   * Convert a chain-side asset balance / UTXO satoshis value back to a
   * user-facing amount. The chain consistently encodes asset balances
   * in 10^8 sats (because everything goes through AmountFromValue on
   * the way in), so the divisor is always 10^8 — independent of the
   * asset's `units`.
   *
   * @param {number} satoshis - Chain value in 10^8 sats
   * @param {number} units - Asset decimal places (unused; kept for API)
   * @returns {number} User-facing asset amount
   */
  fromSatoshis(satoshis, units) {
    void units;
    return satoshis / 100000000;
  }

  /**
   * Normalize builder inputs to raw transaction inputs
   * @param {Array} inputs - Builder inputs
   * @returns {Array<{txid: string, vout: number}>} Raw transaction inputs
   */
  toRawTxInputs(inputs) {
    return (inputs || []).map(input => ({
      txid: input.txid,
      vout: input.vout !== undefined ? input.vout : input.outputIndex
    }));
  }

  /**
   * Convert XNA amount to satoshis
   * @param {number|null|undefined} amount - Amount in XNA
   * @returns {number|undefined} Amount in satoshis
   */
  xnaToSatoshis(amount) {
    if (amount === undefined || amount === null) {
      return undefined;
    }

    return Math.round(amount * 100000000);
  }

  /**
   * NIP-040 marker for every asset output of the localRawBuild metadata.
   *
   * The chain decides which marker ("rvn" or "xna") new asset outputs must
   * carry, per network and height, and the node reports the one required for
   * the next block as `getblockchaininfo.asset_marker` (node commit 347362b).
   * Resolution order:
   *   1. `params.assetMarker` (explicit caller override — offline builds,
   *      tests, or a node this library should not ask);
   *   2. `getblockchaininfo.asset_marker` from the connected node;
   *   3. `'rvn'` when the node predates the field (a node without it enforces
   *      the legacy marker, so that is the right answer, not a guess).
   *
   * An RPC *failure* is a different case, and `params.assetMarkerPolicy`
   * decides it:
   *   - `'legacy-fallback'` (default in 1.x) resolves `'rvn'`, preserving the
   *     1.4.x behaviour;
   *   - `'strict'` propagates the failure. On a post-NIP-040 chain a build
   *     that guessed `'rvn'` produces a transaction the node rejects with
   *     `bad-txns-legacy-asset-marker-after-nip040`, so an online wallet
   *     should not treat "the node did not answer" as "the node said rvn".
   *
   * A value present but outside `rvn`/`xna` is an error under both policies.
   * The RPC-built transaction path never needs any of this: the node stamps
   * the marker itself in `createrawtransaction`.
   *
   * @returns {Promise<'rvn'|'xna'>} Marker for locally built asset outputs
   */
  resolveAssetMarker() {
    if (!this._assetMarkerPromise) {
      // Memoized including rejection, so a strict failure is one RPC call and
      // one error, not one per asset output.
      this._assetMarkerPromise = this._fetchAssetMarker();
    }
    return this._assetMarkerPromise;
  }

  /**
   * Resolve the configured marker failure policy.
   *
   * @returns {'strict'|'legacy-fallback'} Policy in force for this build
   */
  assetMarkerPolicy() {
    const policy = this.params.assetMarkerPolicy;
    if (policy === undefined || policy === null) {
      return 'legacy-fallback';
    }
    if (policy !== 'strict' && policy !== 'legacy-fallback') {
      throw new Error(
        `Invalid assetMarkerPolicy: ${policy} (expected 'strict' or 'legacy-fallback')`
      );
    }
    return policy;
  }

  async _fetchAssetMarker() {
    const policy = this.assetMarkerPolicy();
    const override = this.params.assetMarker;
    if (override !== undefined && override !== null) {
      if (override !== 'rvn' && override !== 'xna') {
        throw new Error(
          `Invalid assetMarker: ${override} (expected 'rvn' or 'xna', the value of getblockchaininfo.asset_marker)`
        );
      }
      return override;
    }

    let info = null;
    try {
      info = await this.rpc('getblockchaininfo', []);
    } catch (error) {
      if (policy === 'strict') {
        throw new Error(
          `Cannot resolve the NIP-040 asset marker: getblockchaininfo failed ` +
          `(${rpcErrorMessage(error)}). Under assetMarkerPolicy 'strict' this ` +
          `is not downgraded to 'rvn', which a post-NIP-040 chain would reject. ` +
          `Pass params.assetMarker to build offline.`
        );
      }
      return 'rvn';
    }
    const marker = info ? info.asset_marker : undefined;
    if (marker === undefined || marker === null) {
      // A valid answer from a node that predates the field: legacy is correct.
      return 'rvn';
    }
    if (marker !== 'rvn' && marker !== 'xna') {
      throw new Error(`Node reported an unknown asset_marker: ${marker}`);
    }
    return marker;
  }

  /**
   * Build a typed local raw build payload compatible with
   * @neuraiproject/neurai-create-transaction createFromOperation(...)
   *
   * Stamps the NIP-040 `assetMarker` (see resolveAssetMarker) so
   * createFromOperation >= 0.7.0 emits the marker the chain requires.
   *
   * @param {string} operationType - Operation type
   * @param {Array} inputs - Builder inputs
   * @param {object|null} burnInfo - Burn metadata
   * @param {string|null} changeAddress - XNA change address
   * @param {number|null} changeAmount - XNA change amount in XNA
   * @param {object} operationParams - Operation-specific params
   * @returns {Promise<{ operationType: string, params: object }>} Local raw build
   */
  async buildLocalRawBuild(
    operationType,
    inputs,
    burnInfo = null,
    changeAddress = null,
    changeAmount = null,
    operationParams = {}
  ) {
    const params = {
      inputs: this.toRawTxInputs(inputs),
      assetMarker: await this.resolveAssetMarker(),
      ...operationParams
    };

    if (burnInfo && burnInfo.address && burnInfo.amount !== undefined && burnInfo.amount !== null) {
      params.burnAddress = burnInfo.address;
      params.burnAmountSats = this.xnaToSatoshis(burnInfo.amount);
    }

    if (changeAddress && changeAmount !== undefined && changeAmount !== null) {
      params.xnaChangeAddress = changeAddress;
      params.xnaChangeSats = this.xnaToSatoshis(changeAmount);
    }

    return {
      operationType,
      params
    };
  }

  /**
   * Build the canonical `createTransactionBuild` payload: the exact shape
   * `createFromOperation(...)` accepts, with no adaptation, renaming or
   * rescaling left for the consumer.
   *
   * Differences from the deprecated `buildLocalRawBuild`:
   *   - every amount is a protocol integer (`bigint`), never a display value
   *     under a `*Raw` name;
   *   - a transfer carries a discriminant the serializer knows
   *     (`STANDARD_TRANSFER` / `TRANSFER_DEPIN`), not the internal `TRANSFER`;
   *   - the network, when included, is the canonical label, so the DePIN
   *     mainnet guard actually runs.
   *
   * @param {string} operationType - Canonical create-transaction discriminant
   * @param {Array} inputs - Builder inputs
   * @param {object} [envelope] - XNA envelope
   * @param {string} [envelope.burnAddress] - Burn address
   * @param {bigint} [envelope.burnSats] - Burn amount in satoshis
   * @param {string} [envelope.changeAddress] - XNA change address
   * @param {bigint} [envelope.changeSats] - XNA change in satoshis
   * @param {object} [operationParams] - Operation-specific canonical params
   * @returns {Promise<{operationType: string, params: object}>} Canonical build
   */
  async buildCreateTransactionBuild(
    operationType,
    inputs,
    envelope = {},
    operationParams = {}
  ) {
    const params = {
      inputs: this.toRawTxInputs(inputs),
      assetMarker: await this.resolveAssetMarker(),
      ...operationParams
    };

    if (envelope.burnAddress && envelope.burnSats !== undefined && envelope.burnSats !== null) {
      params.burnAddress = envelope.burnAddress;
      params.burnAmountSats = toProtocolInteger(envelope.burnSats, 'burnSats');
    }

    if (
      envelope.changeAddress &&
      envelope.changeSats !== undefined &&
      envelope.changeSats !== null &&
      toProtocolInteger(envelope.changeSats, 'changeSats') >= DUST_SATS
    ) {
      params.xnaChangeAddress = envelope.changeAddress;
      params.xnaChangeSats = toProtocolInteger(envelope.changeSats, 'changeSats');
    }

    return {
      operationType,
      params
    };
  }

  /**
   * Convert a user-facing asset amount to the raw protocol integer.
   *
   * @param {string|number} amount - Display amount
   * @param {number} [units] - Asset decimal places, for the divisibility check
   * @param {string} [label] - Prefix for error messages
   * @returns {bigint} Raw amount, 10^8-scaled
   */
  assetAmountToRaw(amount, units, label) {
    return assetAmountToRaw(amount, units, { label: label || 'asset amount' });
  }

  /**
   * Convert a user-facing XNA amount to satoshis.
   *
   * @param {string|number} amount - Display XNA amount
   * @param {object} [options] - Passed through to xnaAmountToSats
   * @returns {bigint} Satoshis
   */
  xnaAmountToSats(amount, options) {
    return xnaAmountToSats(amount, options);
  }

  /**
   * Render a protocol integer as the display value the RPC envelope expects.
   *
   * @param {bigint} sats - Protocol integer
   * @returns {number} Display amount
   */
  satsToDisplay(sats) {
    return rawToDisplayNumber(sats, 'display amount');
  }

  /**
   * Sum the `satoshis` field of UTXOs exactly.
   *
   * @param {Array} utxos - UTXOs
   * @param {string} [label] - Prefix for error messages
   * @returns {bigint} Exact total
   */
  sumSatoshis(utxos, label) {
    return sumProtocolIntegers(utxos, 'satoshis', label || 'utxo.satoshis');
  }

  /**
   * Normalize ordered outputs into flat entries
   * @param {Array|object} outputs - Transaction outputs
   * @returns {Array<{address: string, value: unknown}>} Output entries
   */
  getOutputEntries(outputs) {
    if (Array.isArray(outputs)) {
      return outputs.map(output => {
        const [address, value] = Object.entries(output)[0];
        return { address, value };
      });
    }

    if (outputs && typeof outputs === 'object') {
      return Object.entries(outputs).map(([address, value]) => ({ address, value }));
    }

    return [];
  }

  /**
   * Extract burn metadata from outputs
   * @param {Array<{address: string, value: unknown}>} entries - Output entries
   * @param {number} burnAmount - Burn amount in XNA
   * @returns {{ burnAddress: string|null, burnAmount: number }}
   */
  extractBurnMetadata(entries, burnAmount) {
    if (!burnAmount || burnAmount <= 0) {
      return {
        burnAddress: null,
        burnAmount: 0
      };
    }

    const burnEntry = entries.find(({ address, value }) => {
      return typeof value === 'number' &&
        value === burnAmount &&
        this.burnManager.isBurnAddress(address);
    });

    return {
      burnAddress: burnEntry ? burnEntry.address : null,
      burnAmount
    };
  }

  /**
   * Extract XNA change metadata from outputs
   * @param {Array<{address: string, value: unknown}>} entries - Output entries
   * @param {string|null} burnAddress - Burn address if present
   * @returns {{ changeAddress: string|null, changeAmount: number|null }}
   */
  extractChangeMetadata(entries, burnAddress = null) {
    const xnaOutputs = entries.filter(({ address, value }) => {
      return typeof value === 'number' && address !== burnAddress;
    });

    if (xnaOutputs.length !== 1) {
      return {
        changeAddress: null,
        changeAmount: null
      };
    }

    return {
      changeAddress: xnaOutputs[0].address,
      changeAmount: xnaOutputs[0].value
    };
  }

  /**
   * Format transaction result
   * @param {string} rawTx - Raw transaction hex
   * @param {Array} utxos - UTXOs used
   * @param {Array} inputs - Transaction inputs
   * @param {object} outputs - Transaction outputs
   * @param {number} fee - Transaction fee
   * @param {number} burnAmount - Burn amount
   * @param {object} extra - Extra information
   * @returns {object} Formatted result
   */
  formatResult(rawTx, utxos, inputs, outputs, fee, burnAmount, extra = {}) {
    const outputEntries = this.getOutputEntries(outputs);
    const burnMetadata = this.extractBurnMetadata(outputEntries, burnAmount);
    const changeMetadata = this.extractChangeMetadata(outputEntries, burnMetadata.burnAddress);

    return {
      rawTx,
      utxos,
      inputs,
      outputs,
      fee,
      burnAmount: burnMetadata.burnAmount,
      network: this.network,
      buildStrategy: 'rpc-node',
      burnAddress: burnMetadata.burnAddress,
      changeAddress: extra.changeAddress !== undefined
        ? extra.changeAddress
        : changeMetadata.changeAddress,
      changeAmount: extra.changeAmount !== undefined
        ? extra.changeAmount
        : changeMetadata.changeAmount,
      ...extra
    };
  }

  /**
   * Check if asset exists (to prevent creating duplicates)
   * @param {string} assetName - Asset name to check
   * @returns {Promise<boolean>} True if exists
   */
  async assetExists(assetName) {
    try {
      const assetData = await this.rpc('getassetdata', [assetName]);
      return assetData !== null && assetData !== undefined;
    } catch (error) {
      // If asset doesn't exist, RPC will throw error
      if (rpcErrorMessage(error).includes('not found')) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get asset data from blockchain
   * @param {string} assetName - Asset name
   * @returns {Promise<object|null>} Asset data or null if not found
   */
  async getAssetData(assetName) {
    try {
      return await this.rpc('getassetdata', [assetName]);
    } catch (error) {
      if (rpcErrorMessage(error).includes('not found')) {
        return null;
      }
      throw error;
    }
  }
}

module.exports = BaseAssetTransactionBuilder;
