/**
 * Reissue Restricted Builder
 * Builds transactions for reissuing RESTRICTED assets
 *
 * Reissue Restricted:
 * - Mints additional supply of restricted asset
 * - Cost: 200 XNA (burned)
 * - Requires asset's owner token ($ASSET!)
 * - Can update verifier string
 * - Can lock asset (make it non-reissuable)
 * - Can update IPFS metadata
 * - Owner token must be returned
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const {
  AssetNotFoundError,
  AssetNotReissuableError,
  OwnerTokenNotFoundError,
  MaxSupplyExceededError
} = require('../errors');
const { IpfsValidator, VerifierValidator } = require('../validators');
const { ASSET_LIMITS } = require('../constants');

class ReissueRestrictedBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate reissue restricted parameters
   * @param {object} params - Reissue parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    // Validate required parameters
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    // Validate asset name is restricted
    this.validateAssetName(params.assetName, 'RESTRICTED');

    if (params.quantity === undefined || params.quantity === null) {
      throw new Error('quantity is required (amount to mint)');
    }

    if (params.quantity <= 0) {
      throw new Error('quantity must be greater than 0');
    }

    // Validate verifier string if changing
    if (params.changeVerifier && params.newVerifier) {
      VerifierValidator.validate(params.newVerifier);
    }

    // Validate new IPFS hash if provided
    if (params.newIpfs) {
      IpfsValidator.validate(params.newIpfs);
    }

    return true;
  }

  /**
   * Build reissue restricted transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      changeVerifier = false,
      newVerifier,
      reissuable,
      newIpfs
    } = this.params;

    // 2. Get asset data to verify it exists and is reissuable
    const assetData = await this.getAssetData(assetName);
    if (!assetData) {
      throw new AssetNotFoundError(
        `Asset ${assetName} does not exist on the blockchain`,
        assetName
      );
    }

    // 3. Check if asset is reissuable
    if (!assetData.reissuable) {
      throw new AssetNotReissuableError(
        `Asset ${assetName} is not reissuable. The supply has been locked.`,
        assetName
      );
    }

    // 4. Check if reissuing would exceed max supply
    const currentSupply = assetData.amount || 0;
    const additionalAmount = quantity;
    const newTotalSupply = currentSupply + additionalAmount;

    if (newTotalSupply > ASSET_LIMITS.MAX_QUANTITY) {
      throw new MaxSupplyExceededError(
        `Reissuing ${additionalAmount} would exceed maximum supply. ` +
        `Current: ${currentSupply}, Additional: ${additionalAmount}, ` +
        `Max: ${ASSET_LIMITS.MAX_QUANTITY}`,
        assetName,
        currentSupply,
        additionalAmount,
        ASSET_LIMITS.MAX_QUANTITY
      );
    }

    // 5. Get addresses
    const addresses = await this._getAddresses();
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    // 6. Find owner token (CRITICAL: must have this)
    const ownerTokenName = AssetNameParser.getOwnerTokenName(assetName);
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await this.ownerTokenManager.findOwnerTokenUTXO(
        ownerTokenName,
        addresses
      );
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the asset's owner token (${ownerTokenName}) to reissue it. ` +
          `The owner token proves you have the right to mint more supply and manage the asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 7. Get burn information
    const burnInfo = this.burnManager.getReissueBurn();

    // 8. Estimate fee
    const estimatedFee = await this.estimateFee(2, 4);

    // 9. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 10. Select XNA UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 11. Recalculate fee with actual input count
    const actualInputCount = baseCurrencyUTXOs.length + 1; // +1 for owner token
    const actualFee = await this.estimateFee(actualInputCount, 4);

    // 12. Verify we have enough XNA
    const totalRequired = burnInfo.amount + actualFee;
    if (totalXNAInput < totalRequired) {
      const additionalNeeded = totalRequired - totalXNAInput + 0.001;
      const additionalSelection = await this.selectUTXOs(additionalNeeded, null, 0);
      baseCurrencyUTXOs.push(...additionalSelection.xnaUTXOs);
    }

    // 13. Calculate XNA change
    const finalTotalInput = baseCurrencyUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis / 100000000,
      0
    );
    const xnaChange = finalTotalInput - burnInfo.amount - actualFee;

    // 14. Build inputs (XNA + owner token)
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

    // 15. Build outputs (ORDER CRITICAL!)
    const outputs = {};

    // First: Burn output
    outputs[burnInfo.address] = burnInfo.amount;

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs[changeAddress] = parseFloat(xnaChange.toFixed(8));
    }

    // Third: Owner token return (CRITICAL - must return or lost forever!)
    const ownerReturnAddress = this.params.ownerChangeAddress || changeAddress;
    const ownerTokenReturn = this.ownerTokenManager.createOwnerTokenReturnOutput(
      ownerTokenName,
      ownerReturnAddress
    );
    Object.assign(outputs, ownerTokenReturn);

    // Last: Reissue restricted operation
    const units = assetData.units || 0;
    const reissueRestrictedOutput = OutputFormatter.formatReissueRestrictedOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, units),
      change_verifier: changeVerifier,
      new_verifier: changeVerifier ? newVerifier : undefined,
      reissuable: reissuable !== undefined ? reissuable : undefined,
      new_ipfs: newIpfs || undefined
    });

    outputs[toAddress] = reissueRestrictedOutput;

    // 16. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 17. Validate owner token is returned (safety check)
    this.ownerTokenManager.validateOwnerTokenReturn(inputs, orderedOutputs);

    // 18. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 19. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    // Extract qualifiers from new verifier if changed
    const requiredQualifiers = changeVerifier && newVerifier
      ? VerifierValidator.extractQualifiers(newVerifier)
      : null;

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        assetName,
        ownerTokenUsed: ownerTokenName,
        quantityMinted: quantity,
        newTotalSupply,
        previousSupply: currentSupply,
        verifierChanged: changeVerifier,
        newVerifier: changeVerifier ? newVerifier : undefined,
        requiredQualifiers,
        reissuableLocked: reissuable === false,
        operationType: 'REISSUE_RESTRICTED'
      }
    );
  }
}

module.exports = ReissueRestrictedBuilder;
