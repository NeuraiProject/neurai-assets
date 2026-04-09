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
 * - Root qualifiers do not create owner tokens
 * - Sub-qualifiers consume and return the parent qualifier asset itself
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

    // 3. If sub-qualifier, check parent exists and get parent qualifier input
    let parentQualifierUTXOs = [];
    let parentQualifierQuantity = null;
    let parentQualifierName = null;
    const addresses = await this._getAddresses();

    if (isSub) {
      parentQualifierName = parsed.parent;

      // Check parent qualifier exists
      const parentExists = await this.assetExists(parentQualifierName);
      if (!parentExists) {
        throw new ParentAssetNotFoundError(
          `Parent qualifier ${parentQualifierName} does not exist. You must create the parent qualifier first.`,
          parentQualifierName
        );
      }

      // Find parent qualifier balance to spend and return as change
      try {
        const selection = await this.utxoSelector.selectAssetUTXOs(addresses, parentQualifierName, 1);
        parentQualifierUTXOs = selection.utxos;
        parentQualifierQuantity = selection.totalAmount;
      } catch (error) {
        if (error.name === 'InsufficientFundsError') {
          throw new OwnerTokenNotFoundError(
            `You must own the parent qualifier asset (${parentQualifierName}) to create a sub-qualifier.`,
            parentQualifierName
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
    const outputCount = 3;
    const estimatedFee = await this.estimateFee(2, outputCount);

    // 8. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 9. Select XNA UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 10. Recalculate fee with actual input count
    const actualInputCount = baseCurrencyUTXOs.length + parentQualifierUTXOs.length;
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

    // Add parent qualifier inputs if sub-qualifier
    parentQualifierUTXOs.forEach(parentUTXO => {
      inputs.push({
        txid: parentUTXO.txid,
        vout: parentUTXO.outputIndex,
        address: parentUTXO.address,
        assetName: parentUTXO.assetName,
        satoshis: parentUTXO.satoshis
      });
    });

    // 14. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    // Last: Issue qualifier operation
    const issueQualifierOutput = OutputFormatter.formatIssueQualifierOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, 0),
      has_ipfs: hasIpfs,
      ipfs_hash: ipfsHash,
      root_change_address: isSub ? changeAddress : undefined,
      change_quantity: isSub && parentQualifierQuantity !== null
        ? this.toSatoshis(parentQualifierQuantity, 0)
        : undefined
    });

    outputs.push({ [toAddress]: issueQualifierOutput });

    // 15. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 16. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 17. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ...parentQualifierUTXOs];

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
        parentQualifierUsed: parentQualifierName,
        operationType: isSub ? 'ISSUE_SUB_QUALIFIER' : 'ISSUE_QUALIFIER',
        localRawBuild: this.buildLocalRawBuild(
          isSub ? 'ISSUE_SUB_QUALIFIER' : 'ISSUE_QUALIFIER',
          inputs,
          burnInfo,
          changeAddress,
          xnaChange > 0.00000001 ? parseFloat(xnaChange.toFixed(8)) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, 0),
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            rootChangeAddress: isSub ? changeAddress : undefined,
            changeQuantityRaw: isSub && parentQualifierQuantity !== null
              ? this.toSatoshis(parentQualifierQuantity, 0)
              : undefined
          }
        )
      }
    );
  }
}

module.exports = IssueQualifierBuilder;
