/**
 * Issue Root Builder
 * Builds transactions for creating ROOT assets
 *
 * ROOT assets:
 * - Top-level assets (3-30 uppercase characters)
 * - Cost: 1000 XNA (burned)
 * - Automatically creates owner token (ASSET!)
 * - Can be reissuable or non-reissuable
 * - Optional IPFS metadata
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter } = require('../utils');
const { AssetExistsError, InvalidIPFSHashError } = require('../errors');
const { IpfsValidator } = require('../validators');

class IssueRootBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate issue ROOT parameters
   * @param {object} params - Issue parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    // Validate required parameters
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    if (params.quantity === undefined || params.quantity === null) {
      throw new Error('quantity is required');
    }

    // Validate asset name (ROOT format)
    this.validateAssetName(params.assetName, 'ROOT');

    // Validate quantity and units
    const units = params.units !== undefined ? params.units : 0;
    this.validateAmount(params.quantity, units);

    // Validate IPFS hash if provided
    if (params.hasIpfs && params.ipfsHash) {
      IpfsValidator.validate(params.ipfsHash);
    }

    // Validate reissuable is boolean if provided
    if (params.reissuable !== undefined && typeof params.reissuable !== 'boolean') {
      throw new Error('reissuable must be a boolean');
    }

    return true;
  }

  /**
   * Build ROOT asset issuance transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      units = 0,
      reissuable = true,
      hasIpfs = false,
      ipfsHash = ''
    } = this.params;

    // 2. Check if asset already exists
    const exists = await this.assetExists(assetName);
    if (exists) {
      throw new AssetExistsError(
        `Asset ${assetName} already exists on the blockchain`,
        assetName
      );
    }

    // 3. Get burn information
    const burnInfo = this.burnManager.getIssueRootBurn();

    // 4. Get addresses
    const addresses = await this._getAddresses();
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    // 5. Estimate fee (rough estimate for initial UTXO selection)
    const estimatedFee = await this.estimateFee(1, 3);

    // 6. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 7. Select UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 8. Recalculate fee with actual input count
    const actualFee = await this.estimateFee(baseCurrencyUTXOs.length, 3);

    // 9. Verify we still have enough after fee recalculation
    const totalRequired = burnInfo.amount + actualFee;
    if (totalXNAInput < totalRequired) {
      // Need to select more UTXOs
      const additionalNeeded = totalRequired - totalXNAInput + 0.001; // Add small buffer
      const additionalSelection = await this.selectUTXOs(additionalNeeded, null, 0);
      baseCurrencyUTXOs.push(...additionalSelection.xnaUTXOs);
    }

    // 10. Calculate final totals
    const finalTotalInput = baseCurrencyUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis / 100000000,
      0
    );
    const xnaChange = finalTotalInput - burnInfo.amount - actualFee;

    // 11. Build inputs
    const inputs = baseCurrencyUTXOs.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.outputIndex,
      address: utxo.address,
      satoshis: utxo.satoshis
    }));

    // 12. Build outputs (ORDER MATTERS!)
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      // Only add change if meaningful amount
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    // Last: Issue operation
    const issueOutput = OutputFormatter.formatIssueOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, units),
      units: units,
      reissuable: reissuable,
      has_ipfs: hasIpfs,
      ipfs_hash: ipfsHash
    });

    outputs.push({ [toAddress]: issueOutput });

    // 13. Order outputs (critical for protocol)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 14. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 15. Format and return result
    return this.formatResult(
      rawTx,
      baseCurrencyUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        assetName,
        ownerTokenName: assetName + '!',
        operationType: 'ISSUE_ROOT'
      }
    );
  }
}

module.exports = IssueRootBuilder;
