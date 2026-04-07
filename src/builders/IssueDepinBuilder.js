/**
 * Issue DePIN Builder
 * Builds transactions for creating DEPIN assets.
 *
 * DEPIN assets:
 * - Soulbound assets
 * - Format: &NAME or &NAME/SUB
 * - Cost: 10 XNA (same burn as UNIQUE assets)
 * - Units: Always 0
 * - Owner token is auto-created by the node
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter } = require('../utils');
const { AssetExistsError } = require('../errors');
const { IpfsValidator } = require('../validators');

class IssueDepinBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate issue DEPIN parameters
   * @param {object} params - Issue parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    if (params.quantity === undefined || params.quantity === null) {
      throw new Error('quantity is required');
    }

    this.validateAssetName(params.assetName, 'DEPIN');
    this.validateAmount(params.quantity, 0);

    if (params.units !== undefined && params.units !== 0) {
      throw new Error('DEPIN assets must use units=0');
    }

    if (params.hasIpfs && params.ipfsHash) {
      IpfsValidator.validate(params.ipfsHash);
    }

    if (params.reissuable !== undefined && typeof params.reissuable !== 'boolean') {
      throw new Error('reissuable must be a boolean');
    }

    return true;
  }

  /**
   * Build DEPIN asset issuance transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      reissuable = true,
      hasIpfs = false,
      ipfsHash = ''
    } = this.params;

    const exists = await this.assetExists(assetName);
    if (exists) {
      throw new AssetExistsError(
        `Asset ${assetName} already exists on the blockchain`,
        assetName
      );
    }

    const burnInfo = this.burnManager.getIssueDepinBurn();
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    const estimatedFee = await this.estimateFee(1, 3);
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    const actualFee = await this.estimateFee(baseCurrencyUTXOs.length, 3);
    const totalRequired = burnInfo.amount + actualFee;

    if (totalXNAInput < totalRequired) {
      const additionalNeeded = totalRequired - totalXNAInput + 0.001;
      const additionalSelection = await this.selectUTXOs(additionalNeeded, null, 0);
      baseCurrencyUTXOs.push(...additionalSelection.xnaUTXOs);
    }

    const finalTotalInput = baseCurrencyUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis / 100000000,
      0
    );
    const xnaChange = finalTotalInput - burnInfo.amount - actualFee;

    const inputs = baseCurrencyUTXOs.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.outputIndex,
      address: utxo.address,
      satoshis: utxo.satoshis
    }));

    const outputs = [];
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    if (xnaChange > 0.00000001) {
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    const issueOutput = OutputFormatter.formatIssueOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, 0),
      units: 0,
      reissuable,
      has_ipfs: hasIpfs,
      ipfs_hash: ipfsHash
    });

    outputs.push({ [toAddress]: issueOutput });

    const orderedOutputs = this.outputOrderer.order(outputs);
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    return this.formatResult(
      rawTx,
      baseCurrencyUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        assetName,
        ownerTokenName: `${assetName}!`,
        operationType: 'ISSUE_DEPIN'
      }
    );
  }
}

module.exports = IssueDepinBuilder;
