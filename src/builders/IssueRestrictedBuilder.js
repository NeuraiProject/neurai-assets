/**
 * Issue Restricted Builder
 * Builds transactions for creating RESTRICTED assets (security tokens)
 *
 * RESTRICTED assets:
 * - Security tokens with KYC/compliance controls
 * - Format: $NAME (e.g., $SECURITY, $STOCK)
 * - Cost: 3000 XNA (burned)
 * - Requires verifier string (boolean logic with qualifiers)
 * - Only addresses meeting verifier requirements can receive/hold
 * - Can freeze individual addresses or entire asset
 * - Creates owner token ($ASSET!)
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter } = require('../utils');
const { AssetExistsError } = require('../errors');
const { IpfsValidator, VerifierValidator } = require('../validators');

class IssueRestrictedBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate issue RESTRICTED parameters
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

    if (!params.verifierString) {
      throw new Error('verifierString is required for restricted assets');
    }

    // Validate asset name (RESTRICTED format: $NAME)
    this.validateAssetName(params.assetName, 'RESTRICTED');

    // Validate quantity and units
    const units = params.units !== undefined ? params.units : 0;
    this.validateAmount(params.quantity, units);

    // Validate verifier string (critical for compliance)
    VerifierValidator.validate(params.verifierString);

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
   * Build RESTRICTED asset issuance transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      units = 0,
      verifierString,
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

    // 3. Extract qualifiers from verifier string for info
    const requiredQualifiers = VerifierValidator.extractQualifiers(verifierString);

    // 4. Get burn information (3000 XNA for restricted assets)
    const burnInfo = this.burnManager.getIssueRestrictedBurn();

    // 5. Get addresses
    const addresses = await this._getAddresses();
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    // 6. Estimate fee
    const estimatedFee = await this.estimateFee(1, 3);

    // 7. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 8. Select XNA UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 9. Recalculate fee with actual input count
    const actualFee = await this.estimateFee(baseCurrencyUTXOs.length, 3);

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

    // 12. Build inputs
    const inputs = baseCurrencyUTXOs.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.outputIndex,
      address: utxo.address,
      satoshis: utxo.satoshis
    }));

    // 13. Build outputs (ORDER CRITICAL!)
    const outputs = {};

    // First: Burn output
    outputs[burnInfo.address] = burnInfo.amount;

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs[changeAddress] = parseFloat(xnaChange.toFixed(8));
    }

    // Last: Issue restricted operation
    const issueRestrictedOutput = OutputFormatter.formatIssueRestrictedOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, units),
      verifier_string: verifierString,
      units: units,
      reissuable: reissuable,
      has_ipfs: hasIpfs,
      ipfs_hash: ipfsHash
    });

    outputs[toAddress] = issueRestrictedOutput;

    // 14. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 15. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 16. Format and return result
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
        verifierString,
        requiredQualifiers,
        operationType: 'ISSUE_RESTRICTED'
      }
    );
  }
}

module.exports = IssueRestrictedBuilder;
