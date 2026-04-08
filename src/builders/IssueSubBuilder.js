/**
 * Issue Sub Builder
 * Builds transactions for creating SUB assets
 *
 * SUB assets:
 * - Child of a ROOT asset (format: ROOT/SUBNAME)
 * - Cost: 200 XNA (burned)
 * - Requires parent's owner token (ROOT!)
 * - Creates own owner token (ROOT/SUB!)
 * - Parent owner token must be returned in outputs
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const {
  AssetExistsError,
  ParentAssetNotFoundError,
  OwnerTokenNotFoundError
} = require('../errors');
const { IpfsValidator } = require('../validators');

class IssueSubBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate issue SUB parameters
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

    // Validate asset name (SUB format: ROOT/SUBNAME)
    this.validateAssetName(params.assetName, 'SUB');

    // Validate quantity and units
    const units = params.units !== undefined ? params.units : 0;
    this.validateAmount(params.quantity, units);

    // Validate IPFS hash if provided
    if (params.hasIpfs && params.ipfsHash) {
      IpfsValidator.validate(params.ipfsHash);
    }

    return true;
  }

  /**
   * Build SUB asset issuance transaction
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

    // 2. Parse asset name to get parent
    const parsed = AssetNameParser.parse(assetName);
    const parentAssetName = parsed.parent;

    if (!parentAssetName) {
      throw new Error('Cannot parse parent asset from SUB asset name');
    }

    // 3. Check if parent asset exists
    const parentExists = await this.assetExists(parentAssetName);
    if (!parentExists) {
      throw new ParentAssetNotFoundError(
        `Parent asset ${parentAssetName} does not exist. You must create the ROOT asset first.`,
        parentAssetName
      );
    }

    // 4. Check if SUB asset already exists
    const subExists = await this.assetExists(assetName);
    if (subExists) {
      throw new AssetExistsError(
        `Asset ${assetName} already exists on the blockchain`,
        assetName
      );
    }

    // 5. Get addresses
    const addresses = await this._getAddresses();
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    // 6. Find parent's owner token (CRITICAL: must have this)
    const ownerTokenName = AssetNameParser.getOwnerTokenName(parentAssetName);
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await this.ownerTokenManager.findOwnerTokenUTXO(
        ownerTokenName,
        addresses
      );
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the parent asset's owner token (${ownerTokenName}) to create a SUB asset. ` +
          `The owner token proves you control the parent asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 7. Get burn information
    const burnInfo = this.burnManager.getIssueSubBurn();

    // 8. Estimate fee
    // Inputs: XNA UTXOs + owner token UTXO
    // Outputs: burn + change + owner token return + issue operation
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
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    // Third: Owner token return (CRITICAL - must return or lost forever!)
    const ownerTokenReturn = this.ownerTokenManager.createOwnerTokenReturnOutput(
      ownerTokenName,
      changeAddress // Return owner token to change address
    );
    outputs.push(ownerTokenReturn);

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

    // 16. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 17. Validate owner token is returned (safety check)
    this.ownerTokenManager.validateOwnerTokenReturn(inputs, orderedOutputs);

    // 18. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 19. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        assetName,
        parentAssetName,
        ownerTokenName: assetName + '!',
        parentOwnerTokenUsed: ownerTokenName,
        operationType: 'ISSUE_SUB',
        localRawBuild: this.buildLocalRawBuild(
          'ISSUE_SUB',
          inputs,
          burnInfo,
          changeAddress,
          xnaChange > 0.00000001 ? parseFloat(xnaChange.toFixed(8)) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, units),
            units,
            reissuable,
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            parentOwnerAddress: changeAddress
          }
        )
      }
    );
  }
}

module.exports = IssueSubBuilder;
