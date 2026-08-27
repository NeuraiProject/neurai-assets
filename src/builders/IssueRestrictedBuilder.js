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
    // Fund the XNA side. The owner-token input counts towards the size
    // estimate from the first round and is excluded from XNA selection.
    const burnSats = this.xnaAmountToSats(burnInfo.amount, { label: 'burn amount' });
    const funding = await this.fundXnaInputs({
      outputs: outputAddresses,
      burnSats,
      extraInputs: [ownerTokenUTXO],
      exclude: [ownerTokenUTXO],
      initialInputHint: 1
    });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

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
    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
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
        createTransactionBuild: await this.buildCreateTransactionBuild(
          'ISSUE_RESTRICTED',
          inputs,
          { burnAddress: burnInfo.address, burnSats, changeAddress, changeSats: xnaChangeSats },
          {
            toAddress,
            assetName,
            quantityRaw: this.assetAmountToRaw(quantity, units, 'quantity'),
            verifierString,
            units,
            reissuable,
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            ownerChangeAddress: changeAddress
          }
        ),
        localRawBuild: await this.buildLocalRawBuild(
          'ISSUE_RESTRICTED',
          inputs,
          burnInfo,
          changeAddress,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
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
