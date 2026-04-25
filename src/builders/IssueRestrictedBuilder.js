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
 * - Creates owner token (ASSET!)
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { AssetExistsError, OwnerTokenNotFoundError } = require('../errors');
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

    // 6. Find owner token UTXO (CRITICAL: node requires it as input)
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
          `You must own the owner token (${ownerTokenName}) to issue the restricted asset ${assetName}.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 7. Estimate fee (+1 for owner token input)
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

    baseCurrencyUTXOs.forEach(utxo => {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.outputIndex,
        address: utxo.address,
        satoshis: utxo.satoshis
      });
    });

    // Add owner token input (node requires it to issue restricted asset)
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

    // Last: Issue restricted operation
    const issueRestrictedOutput = OutputFormatter.formatIssueRestrictedOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, units),
      verifier_string: verifierString,
      units: units,
      reissuable: reissuable,
      has_ipfs: hasIpfs,
      ipfs_hash: ipfsHash,
      owner_change_address: changeAddress
    });

    outputs.push({ [toAddress]: issueRestrictedOutput });

    // 15. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

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
        assetName,
        ownerTokenName,
        verifierString,
        requiredQualifiers,
        operationType: 'ISSUE_RESTRICTED',
        localRawBuild: this.buildLocalRawBuild(
          'ISSUE_RESTRICTED',
          inputs,
          burnInfo,
          changeAddress,
          xnaChange > 0.00000001 ? parseFloat(xnaChange.toFixed(8)) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, units),
            verifierString,
            units,
            reissuable,
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            ownerChangeAddress: changeAddress
          }
        )
      }
    );
  }
}

module.exports = IssueRestrictedBuilder;
