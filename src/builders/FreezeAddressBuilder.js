/**
 * Freeze Address Builder
 * Builds transactions for freezing/unfreezing addresses and assets
 *
 * Freeze operations (restricted and DEPIN assets):
 * - Freeze specific addresses (prevent trading)
 * - Unfreeze specific addresses (allow trading again)
 * - Global asset freeze (freeze entire asset)
 * - Global asset unfreeze (unfreeze entire asset)
 * - Cost: No burn (but requires fee)
 * - Requires the asset's owner token ($ASSET! or &ASSET!)
 *
 * A DEPIN asset is frozen with the SAME transaction as a restricted one: the
 * owner-token escort plus one null-asset-data output carrying (name, flag).
 * That is literally what the node builds in UpdateDEPINAddressRestriction
 * (rpc/assets.cpp:70), so it shares this builder instead of having a parallel
 * one that would eventually drift.
 * - Owner token must be returned
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { AssetNotFoundError, OwnerTokenNotFoundError, InvalidAddressError } = require('../errors');

class FreezeAddressBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate freeze/unfreeze parameters
   * @param {object} params - Freeze parameters
   * @param {string} operationType - Operation type
   * @throws {Error} If validation fails
   */
  validateParams(params, operationType) {
    // Validate required parameters
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    // Restricted or DEPIN: the two types the node accepts here
    // (assets.cpp:4496 allows QUALIFIER, SUB_QUALIFIER, RESTRICTED and DEPIN;
    // qualifiers use tag/untag, not this operation).
    this.validateAssetName(
      params.assetName,
      AssetNameParser.isDepin(params.assetName) ? 'DEPIN' : 'RESTRICTED'
    );

    // For address-specific operations, validate addresses
    if (operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES') {
      if (!params.addresses || !Array.isArray(params.addresses) || params.addresses.length === 0) {
        throw new Error('addresses is required and must be a non-empty array');
      }

      // Validate each address
      params.addresses.forEach((address, index) => {
        if (!address || typeof address !== 'string') {
          throw new InvalidAddressError(
            `addresses[${index}] must be a non-empty string`,
            address
          );
        }

        // Address prefix validation is left to the node (varies by network)
      });
    }

    return true;
  }

  /**
   * Build freeze operation transaction
   * @param {string} operationType - Operation type
   * @returns {Promise<object>} Transaction result
   */
  async buildFreezeOperation(operationType) {
    // 1. Validate parameters
    await this.validateParams(this.params, operationType);

    const { assetName } = this.params;
    const isDepin = AssetNameParser.isDepin(assetName);

    // Global freeze belongs to restricted assets: the node exposes it as
    // checkglobalrestriction and there is no DEPIN equivalent. A DEPIN asset
    // is managed holder by holder.
    if (isDepin && (operationType === 'FREEZE_ASSET' || operationType === 'UNFREEZE_ASSET')) {
      throw new Error(
        `Global freeze does not apply to DEPIN assets (${assetName}). ` +
        `Freeze the holder addresses instead.`
      );
    }

    // The owner token depends on nothing that follows, so asking for it
    // alongside the asset reads saves a whole round trip. It is AWAITED where
    // it always was, so the order errors surface in does not change.
    const ownerTokenName = AssetNameParser.getOwnerTokenName(assetName);
    const addresses = await this._getAddresses();
    const ownerTokenLookup = this.ownerTokenManager.findOwnerTokenUTXO(
      ownerTokenName,
      addresses
    );
    ownerTokenLookup.catch(() => {});

    // 2. Check if asset exists and is restricted
    const assetData = await this.getAssetData(assetName);
    if (!assetData) {
      throw new AssetNotFoundError(
        `Asset ${assetName} does not exist on the blockchain`,
        assetName
      );
    }

    // 3. Get wallet addresses
    const changeAddress = await this.getChangeAddress();

    // 4. Find owner token (CRITICAL: must have this)
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await ownerTokenLookup;
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the asset's owner token (${ownerTokenName}) to freeze/unfreeze addresses or the asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // The address holding the owner token cannot be frozen or revoked: the
    // node rejects it (rpc/assets.cpp:106) and, if it slipped through, it
    // would leave the asset with nobody able to unfreeze it. Checked here so
    // the reason is stated instead of surfacing as a consensus error.
    const targets = this.params.addresses || [];
    if (targets.includes(ownerTokenUTXO.address)) {
      throw new Error(
        `${ownerTokenUTXO.address} holds the owner token ${ownerTokenName} and cannot be ` +
        `frozen or revoked: nobody would be able to undo it.`
      );
    }

    // 5. No burn for freeze operations (only fee)
    const burnAmount = 0;

    // 6. Estimate fee
    // Outputs: XNA change + freeze/unfreeze operation (sent to changeAddress)
    // Asset outputs must be described as what the node serializes. As bare
    // addresses they counted 34 bytes each and the whole payload went unpaid;
    // the null-data ones (tag, freeze, verifier) carry no destination at all:
    // their script REPLACES the P2PKH.
    const isGlobal = operationType === 'FREEZE_ASSET' || operationType === 'UNFREEZE_ASSET';
    const frozenAddresses = isGlobal ? [] : (this.params.addresses || []);
    const outputAddresses = [
      changeAddress,
      // The owner token is spent and returned: a transfer.
      { address: changeAddress, assetName: ownerTokenName },
      ...(isGlobal
        ? [{ assetName, kind: 'globalRestriction' }]
        : frozenAddresses.map(target => ({
            address: target, assetName, kind: 'restriction'
          })))
    ];
    // 7-10. Fund the XNA side (fee only, this operation does not burn). The
    //       owner-token input counts towards the size estimate from the first
    //       round and is excluded from XNA selection.
    const funding = await this.fundXnaInputs({
      outputs: outputAddresses,
      extraInputs: [ownerTokenUTXO],
      exclude: [ownerTokenUTXO],
      initialInputHint: 1
    });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

    // 11. Build inputs (XNA + owner token)
    const inputs = [];

    // Add XNA inputs
    baseCurrencyUTXOs.forEach(utxo => {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.outputIndex,
        address: utxo.address,
        satoshis: utxo.satoshis
      });
    });

    // Add owner token input
    inputs.push({
      txid: ownerTokenUTXO.txid,
      vout: ownerTokenUTXO.outputIndex,
      address: ownerTokenUTXO.address,
      assetName: ownerTokenUTXO.assetName,
      satoshis: ownerTokenUTXO.satoshis
    });

    // 12. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: XNA change (if any)
    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
    }

    // Last: Freeze/Unfreeze operation
    let operationOutput;
    let targetAddresses = [];

    switch (operationType) {
      case 'FREEZE_ADDRESSES':
        targetAddresses = this.params.addresses;
        operationOutput = OutputFormatter.formatFreezeAddressesOutput({
          asset_name: assetName,
          addresses: targetAddresses
        });
        outputs.push({ [changeAddress]: operationOutput });
        break;

      case 'UNFREEZE_ADDRESSES':
        targetAddresses = this.params.addresses;
        operationOutput = OutputFormatter.formatUnfreezeAddressesOutput({
          asset_name: assetName,
          addresses: targetAddresses
        });
        outputs.push({ [changeAddress]: operationOutput });
        break;

      case 'FREEZE_ASSET':
        operationOutput = OutputFormatter.formatFreezeAssetOutput(assetName);
        outputs.push({ [changeAddress]: operationOutput });
        break;

      case 'UNFREEZE_ASSET':
        operationOutput = OutputFormatter.formatUnfreezeAssetOutput(assetName);
        outputs.push({ [changeAddress]: operationOutput });
        break;

      default:
        throw new Error(`Unknown freeze operation type: ${operationType}`);
    }

    // 13. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    const canonicalParams =
      operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES'
        ? { assetName, targetAddresses, ownerChangeAddress: changeAddress }
        : { assetName, ownerChangeAddress: changeAddress };

    const createTransactionBuild = await this.buildCreateTransactionBuild(
      operationType,
      inputs,
      { changeAddress, changeSats: xnaChangeSats },
      canonicalParams
    );

    // 14. Create raw transaction.
    //
    // For a DEPIN asset the node's `createrawtransaction` is no use: its
    // freeze_addresses object demands a restricted name and answers "a valid
    // restricted asset name must be provided". That is a limit of that RPC
    // interface, not of the operation — the node accepts the transaction
    // perfectly well — so the hex comes from the local codec, as reissues
    // already do since 1.5.0. Restricted assets keep the usual path.
    const rawTx = isDepin
      ? this.buildRawTransactionLocally(createTransactionBuild, orderedOutputs)
      : await this.buildRawTransaction(inputs, orderedOutputs);

    // 15. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnAmount,
      {
        assetName,
        ownerTokenUsed: ownerTokenName,
        targetAddresses: targetAddresses.length > 0 ? targetAddresses : null,
        addressCount: targetAddresses.length,
        operationType,
        buildStrategy: isDepin ? 'local-builder' : undefined,
        createTransactionBuild,
        localRawBuild: await this.buildLocalRawBuild(
          operationType,
          inputs,
          null,
          xnaChangeSats > 0n ? changeAddress : null,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES'
            ? {
                assetName,
                targetAddresses,
                ownerChangeAddress: changeAddress
              }
            : {
                assetName,
                ownerChangeAddress: changeAddress
              }
        )
      }
    );
  }

  /**
   * Build freeze addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    return this.buildFreezeOperation('FREEZE_ADDRESSES');
  }

  /**
   * Build unfreeze addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildUnfreeze() {
    return this.buildFreezeOperation('UNFREEZE_ADDRESSES');
  }

  /**
   * Build global freeze asset transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildGlobalFreeze() {
    return this.buildFreezeOperation('FREEZE_ASSET');
  }

  /**
   * Build global unfreeze asset transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildGlobalUnfreeze() {
    return this.buildFreezeOperation('UNFREEZE_ASSET');
  }
}

module.exports = FreezeAddressBuilder;
