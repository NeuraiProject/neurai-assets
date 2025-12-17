/**
 * Tag Address Builder
 * Builds transactions for tagging/untagging addresses with qualifiers
 *
 * Tag operations:
 * - Assign qualifier tags to addresses (for restricted asset compliance)
 * - Remove qualifier tags from addresses
 * - Cost: 0.1 XNA per address (burned)
 * - Requires qualifier's owner token (#QUALIFIER!)
 * - Used to mark addresses as KYC'd, accredited, etc.
 * - Owner token must be returned
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { AssetNotFoundError, OwnerTokenNotFoundError, InvalidAddressError } = require('../errors');

class TagAddressBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate tag/untag parameters
   * @param {object} params - Tag parameters
   * @param {boolean} isUntag - True if untag operation
   * @throws {Error} If validation fails
   */
  validateParams(params, isUntag = false) {
    // Validate required parameters
    if (!params.qualifierName) {
      throw new Error('qualifierName is required');
    }

    if (!params.addresses || !Array.isArray(params.addresses) || params.addresses.length === 0) {
      throw new Error('addresses is required and must be a non-empty array');
    }

    // Validate qualifier name
    this.validateAssetName(params.qualifierName, 'QUALIFIER');

    // Validate addresses
    params.addresses.forEach((address, index) => {
      if (!address || typeof address !== 'string') {
        throw new InvalidAddressError(
          `addresses[${index}] must be a non-empty string`,
          address
        );
      }

      // Basic address validation (starts with N or m/n depending on network)
      const validPrefixes = this.network === 'xna' ? ['N'] : ['m', 'n'];
      if (!validPrefixes.some(prefix => address.startsWith(prefix))) {
        throw new InvalidAddressError(
          `addresses[${index}] has invalid prefix for network ${this.network}`,
          address
        );
      }
    });

    return true;
  }

  /**
   * Build tag addresses transaction
   * @param {boolean} isUntag - True for untag operation, false for tag
   * @returns {Promise<object>} Transaction result
   */
  async buildTagOperation(isUntag = false) {
    // 1. Validate parameters
    await this.validateParams(this.params, isUntag);

    const {
      qualifierName,
      addresses: targetAddresses,
      assetData = ''
    } = this.params;

    // 2. Check if qualifier exists
    const qualifierExists = await this.assetExists(qualifierName);
    if (!qualifierExists) {
      throw new AssetNotFoundError(
        `Qualifier ${qualifierName} does not exist. You must create the qualifier first.`,
        qualifierName
      );
    }

    // 3. Get wallet addresses
    const addresses = await this._getAddresses();
    const changeAddress = await this.getChangeAddress();

    // 4. Find qualifier's owner token (CRITICAL: must have this)
    const ownerTokenName = AssetNameParser.getOwnerTokenName(qualifierName);
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await this.ownerTokenManager.findOwnerTokenUTXO(
        ownerTokenName,
        addresses
      );
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the qualifier's owner token (${ownerTokenName}) to tag/untag addresses.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 5. Get burn information (0.1 XNA per address)
    const addressCount = targetAddresses.length;
    const burnInfo = isUntag
      ? this.burnManager.getUntagAddressBurn(addressCount)
      : this.burnManager.getTagAddressBurn(addressCount);

    // 6. Estimate fee
    const estimatedFee = await this.estimateFee(2, 3);

    // 7. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 8. Select XNA UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 9. Recalculate fee with actual input count
    const actualInputCount = baseCurrencyUTXOs.length + 1; // +1 for owner token
    const actualFee = await this.estimateFee(actualInputCount, 3);

    // 10. Verify we have enough XNA
    const totalRequired = burnInfo.amount + actualFee;
    if (totalXNAInput < totalRequired) {
      const additionalNeeded = totalRequired - totalXNAInput + 0.001;
      const additionalSelection = await this.selectUTXOs(additionalNeeded, null, 0);
      baseCurrencyUTXOs.push(...additionalSelection.xnaUTXOs);
    }

    // 11. Calculate XNA change
    const finalTotalInput = baseCurrencyUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis / 100000000,
      0
    );
    const xnaChange = finalTotalInput - burnInfo.amount - actualFee;

    // 12. Build inputs (XNA + owner token)
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

    // 13. Build outputs (ORDER CRITICAL!)
    const outputs = {};

    // First: Burn output
    outputs[burnInfo.address] = burnInfo.amount;

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs[changeAddress] = parseFloat(xnaChange.toFixed(8));
    }

    // Third: Owner token return (CRITICAL - must return or lost forever!)
    const ownerTokenReturn = this.ownerTokenManager.createOwnerTokenReturnOutput(
      ownerTokenName,
      changeAddress
    );
    Object.assign(outputs, ownerTokenReturn);

    // Last: Tag/Untag operation
    // Note: Using first address as transaction output address (protocol requirement)
    const operationOutput = isUntag
      ? OutputFormatter.formatUntagAddressesOutput({
          tag_name: qualifierName,
          addresses: targetAddresses
        })
      : OutputFormatter.formatTagAddressesOutput({
          tag_name: qualifierName,
          addresses: targetAddresses,
          asset_data: assetData
        });

    outputs[targetAddresses[0]] = operationOutput;

    // 14. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 15. Validate owner token is returned (safety check)
    this.ownerTokenManager.validateOwnerTokenReturn(inputs, orderedOutputs);

    // 16. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 17. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        qualifierName,
        ownerTokenUsed: ownerTokenName,
        targetAddresses,
        addressCount,
        operationType: isUntag ? 'UNTAG_ADDRESSES' : 'TAG_ADDRESSES'
      }
    );
  }

  /**
   * Build tag addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    return this.buildTagOperation(false);
  }

  /**
   * Build untag addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildUntag() {
    return this.buildTagOperation(true);
  }
}

module.exports = TagAddressBuilder;
