/**
 * Issue Qualifier Builder
 * Builds transactions for creating QUALIFIER assets
 *
 * QUALIFIER assets:
 * - KYC/compliance tags (e.g., #KYC_VERIFIED, #ACCREDITED)
 * - Format: #NAME or #ROOT/SUB
 * - Cost: 2000 XNA (root) or 200 XNA (sub-qualifier)
 * - Quantity: 1-10 units only
 * - Units: Always 0 (non-divisible)
 * - Used to tag addresses for restricted asset compliance
 * - Creates owner token (#QUALIFIER!)
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { AssetExistsError, ParentAssetNotFoundError, OwnerTokenNotFoundError } = require('../errors');
const { IpfsValidator, AmountValidator } = require('../validators');

class IssueQualifierBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate issue QUALIFIER parameters
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

    // Validate asset name (QUALIFIER format: #NAME)
    this.validateAssetName(params.assetName, 'QUALIFIER');

    // Validate quantity (1-10 only for qualifiers)
    AmountValidator.validateQualifierQuantity(params.quantity);

    // Validate IPFS hash if provided
    if (params.hasIpfs && params.ipfsHash) {
      IpfsValidator.validate(params.ipfsHash);
    }

    return true;
  }

  /**
   * Determine if this is a sub-qualifier
   * @param {string} assetName - Qualifier name
   * @returns {boolean} True if sub-qualifier
   */
  isSubQualifier(assetName) {
    return assetName.includes('/');
  }

  /**
   * Build QUALIFIER asset issuance transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      hasIpfs = false,
      ipfsHash = ''
    } = this.params;

    // 2. Determine if root or sub-qualifier
    const isSub = this.isSubQualifier(assetName);
    const parsed = AssetNameParser.parse(assetName);

    // 3. If sub-qualifier, check parent exists and get owner token
    let ownerTokenUTXO = null;
    let ownerTokenName = null;
    const addresses = await this._getAddresses();

    if (isSub) {
      const parentQualifierName = parsed.parent;

      // Check parent qualifier exists
      const parentExists = await this.assetExists(parentQualifierName);
      if (!parentExists) {
        throw new ParentAssetNotFoundError(
          `Parent qualifier ${parentQualifierName} does not exist. You must create the parent qualifier first.`,
          parentQualifierName
        );
      }

      // Find parent's owner token
      ownerTokenName = AssetNameParser.getOwnerTokenName(parentQualifierName);
      try {
        ownerTokenUTXO = await this.ownerTokenManager.findOwnerTokenUTXO(
          ownerTokenName,
          addresses
        );
      } catch (error) {
        if (error instanceof OwnerTokenNotFoundError) {
          throw new OwnerTokenNotFoundError(
            `You must own the parent qualifier's owner token (${ownerTokenName}) to create a sub-qualifier.`,
            ownerTokenName
          );
        }
        throw error;
      }
    }

    // 4. Check if qualifier already exists
    const exists = await this.assetExists(assetName);
    if (exists) {
      throw new AssetExistsError(
        `Qualifier ${assetName} already exists on the blockchain`,
        assetName
      );
    }

    // 5. Get burn information (2000 XNA for root, 200 XNA for sub)
    const burnInfo = isSub
      ? this.burnManager.getIssueSubQualifierBurn()
      : this.burnManager.getIssueQualifierBurn();

    // 6. Get addresses
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    // 7. Estimate fee
    const outputCount = isSub ? 4 : 3; // Sub has owner token return
    const estimatedFee = await this.estimateFee(2, outputCount);

    // 8. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 9. Select XNA UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 10. Recalculate fee with actual input count
    const actualInputCount = baseCurrencyUTXOs.length + (ownerTokenUTXO ? 1 : 0);
    const actualFee = await this.estimateFee(actualInputCount, outputCount);

    // 11. Verify we have enough XNA
    const totalRequired = burnInfo.amount + actualFee;
    if (totalXNAInput < totalRequired) {
      const additionalNeeded = totalRequired - totalXNAInput + 0.001;
      const additionalSelection = await this.selectUTXOs(additionalNeeded, null, 0);
      baseCurrencyUTXOs.push(...additionalSelection.xnaUTXOs);
    }

    // 12. Calculate XNA change
    const finalTotalInput = baseCurrencyUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis / 100000000,
      0
    );
    const xnaChange = finalTotalInput - burnInfo.amount - actualFee;

    // 13. Build inputs
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

    // Add owner token input if sub-qualifier
    if (ownerTokenUTXO) {
      inputs.push({
        txid: ownerTokenUTXO.txid,
        vout: ownerTokenUTXO.outputIndex,
        address: ownerTokenUTXO.address,
        assetName: ownerTokenUTXO.assetName,
        satoshis: ownerTokenUTXO.satoshis
      });
    }

    // 14. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    // Third: Owner token return (if sub-qualifier)
    if (ownerTokenUTXO && ownerTokenName) {
      const ownerTokenReturn = this.ownerTokenManager.createOwnerTokenReturnOutput(
        ownerTokenName,
        changeAddress
      );
      outputs.push(ownerTokenReturn);
    }

    // Last: Issue qualifier operation
    const issueQualifierOutput = OutputFormatter.formatIssueQualifierOutput({
      asset_name: assetName,
      asset_quantity: quantity,
      has_ipfs: hasIpfs,
      ipfs_hash: ipfsHash
    });

    outputs.push({ [toAddress]: issueQualifierOutput });

    // 15. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 16. Validate owner token is returned if sub-qualifier
    if (ownerTokenUTXO) {
      this.ownerTokenManager.validateOwnerTokenReturn(inputs, orderedOutputs);
    }

    // 17. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 18. Format and return result
    const allUTXOs = ownerTokenUTXO
      ? [...baseCurrencyUTXOs, ownerTokenUTXO]
      : baseCurrencyUTXOs;

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        assetName,
        qualifierType: isSub ? 'SUB_QUALIFIER' : 'QUALIFIER',
        parentQualifier: isSub ? parsed.parent : null,
        ownerTokenName: assetName + '!',
        parentOwnerTokenUsed: ownerTokenName,
        operationType: isSub ? 'ISSUE_SUB_QUALIFIER' : 'ISSUE_QUALIFIER'
      }
    );
  }
}

module.exports = IssueQualifierBuilder;
