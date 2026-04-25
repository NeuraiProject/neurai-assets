/**
 * Issue Unique Builder
 * Builds transactions for creating UNIQUE assets (NFTs)
 *
 * UNIQUE assets:
 * - Non-fungible tokens (NFTs)
 * - Format: ROOT#TAG (e.g., MYNFT#001)
 * - Cost: 10 XNA per NFT (burned)
 * - Requires parent's owner token (ROOT!)
 * - Properties: quantity=1, units=0, reissuable=false (always)
 * - Can create multiple NFTs in single transaction
 * - Each NFT can have unique IPFS metadata
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const {
  ParentAssetNotFoundError,
  OwnerTokenNotFoundError,
  AssetExistsError
} = require('../errors');
const { IpfsValidator } = require('../validators');

class IssueUniqueBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate issue UNIQUE parameters
   * @param {object} params - Issue parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    // Validate required parameters
    if (!params.rootName) {
      throw new Error('rootName is required (parent asset name)');
    }

    if (!params.assetTags || !Array.isArray(params.assetTags) || params.assetTags.length === 0) {
      throw new Error('assetTags is required and must be a non-empty array');
    }

    // Validate root name
    this.validateAssetName(params.rootName, 'ROOT');

    // Validate each tag
    params.assetTags.forEach((tag, index) => {
      if (!tag || typeof tag !== 'string') {
        throw new Error(`assetTags[${index}] must be a non-empty string`);
      }

      // Validate full unique asset name
      const fullName = `${params.rootName}#${tag}`;
      this.validateAssetName(fullName, 'UNIQUE');
    });

    // Validate IPFS hashes if provided
    if (params.ipfsHashes) {
      if (!Array.isArray(params.ipfsHashes)) {
        throw new Error('ipfsHashes must be an array');
      }

      if (params.ipfsHashes.length !== params.assetTags.length) {
        throw new Error(
          `ipfsHashes array length (${params.ipfsHashes.length}) must match ` +
          `assetTags array length (${params.assetTags.length})`
        );
      }

      params.ipfsHashes.forEach((hash, index) => {
        if (hash) {
          IpfsValidator.validate(hash);
        }
      });
    }

    return true;
  }

  /**
   * Build UNIQUE asset issuance transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      rootName,
      assetTags,
      ipfsHashes = []
    } = this.params;

    // 2. Check if parent asset exists
    const parentExists = await this.assetExists(rootName);
    if (!parentExists) {
      throw new ParentAssetNotFoundError(
        `Parent asset ${rootName} does not exist. You must create the ROOT asset first.`,
        rootName
      );
    }

    // 3. Check if any of the unique assets already exist
    for (const tag of assetTags) {
      const fullName = `${rootName}#${tag}`;
      const exists = await this.assetExists(fullName);
      if (exists) {
        throw new AssetExistsError(
          `Unique asset ${fullName} already exists on the blockchain`,
          fullName
        );
      }
    }

    // 4. Get addresses
    const addresses = await this._getAddresses();
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();

    // 5. Find parent's owner token (CRITICAL: must have this)
    const ownerTokenName = AssetNameParser.getOwnerTokenName(rootName);
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await this.ownerTokenManager.findOwnerTokenUTXO(
        ownerTokenName,
        addresses
      );
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the parent asset's owner token (${ownerTokenName}) to create UNIQUE assets. ` +
          `The owner token proves you control the parent asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 6. Get burn information (cost = 10 XNA per NFT)
    const nftCount = assetTags.length;
    const burnInfo = this.burnManager.getIssueUniqueBurn(nftCount);

    // 7. Estimate fee
    // Inputs: XNA UTXOs + owner token UTXO
    // Outputs: burn + change + owner token return + issue_unique operation
    const outputAddresses = [
      burnInfo.address,
      changeAddress,
      changeAddress, // owner token return goes to change address
      toAddress,
    ];
    const estimatedFee = await this.estimateFee(2, outputAddresses);

    // 8. Calculate total XNA needed
    const totalXNANeeded = burnInfo.amount + estimatedFee;

    // 9. Select XNA UTXOs
    const utxoSelection = await this.selectUTXOs(totalXNANeeded, null, 0);
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    const totalXNAInput = utxoSelection.totalXNA;

    // 10. Recalculate fee with actual inputs (PQ-aware), including owner token UTXO
    const actualFeeInputs = [...baseCurrencyUTXOs, ownerTokenUTXO];
    const actualFee = await this.estimateFee(actualFeeInputs, outputAddresses);

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

    // 13. Build inputs (XNA + owner token)
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

    // 14. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChange > 0.00000001) {
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    // Last: Issue unique operation
    // NOTE: owner token return is handled automatically by the node when processing
    // issue_unique — adding it manually would cause TOKEN! to appear twice in outputs
    const issueUniqueOutput = OutputFormatter.formatIssueUniqueOutput({
      root_name: rootName,
      asset_tags: assetTags,
      ipfs_hashes: ipfsHashes.length > 0 ? ipfsHashes : undefined
    });

    outputs.push({ [toAddress]: issueUniqueOutput });

    // 15. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 16. Create raw transaction
    // NOTE: validateOwnerTokenReturn removed — the node returns TOKEN! automatically
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 17. Build list of created NFT names
    const createdNFTs = assetTags.map(tag => `${rootName}#${tag}`);

    // 18. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        rootName,
        assetTags,
        createdNFTs,
        nftCount,
        ownerTokenUsed: ownerTokenName,
        operationType: 'ISSUE_UNIQUE',
        localRawBuild: this.buildLocalRawBuild(
          'ISSUE_UNIQUE',
          inputs,
          burnInfo,
          changeAddress,
          xnaChange > 0.00000001 ? parseFloat(xnaChange.toFixed(8)) : null,
          {
            toAddress,
            rootName,
            assetTags,
            ipfsHashes: ipfsHashes.length > 0 ? ipfsHashes : undefined,
            ownerTokenAddress: changeAddress
          }
        )
      }
    );
  }
}

module.exports = IssueUniqueBuilder;
