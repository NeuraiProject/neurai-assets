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

    // 5-10. Fund the XNA side. fundXnaInputs recomputes the fee with the real
    //       (PQ-aware) descriptors after every top-up and never selects an
    //       outpoint it already holds.
    const outputAddresses = [
      burnInfo.address,
      changeAddress,
      // Asset outputs carry a payload; sizing them as bare P2PKH under-counts
      // the transaction and trips the node's minimum relay fee.
      { address: toAddress, assetName, kind: 'issue', hasIpfs },
      { address: changeAddress, assetName: `${assetName}!`, kind: 'owner' },
    ];
    const burnSats = this.xnaAmountToSats(burnInfo.amount, { label: 'burn amount' });
    const funding = await this.fundXnaInputs({ outputs: outputAddresses, burnSats });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

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
    if (xnaChangeSats > 0n) {
      // Only add change if meaningful amount
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
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
        operationType: 'ISSUE_ROOT',
        createTransactionBuild: await this.buildCreateTransactionBuild(
          'ISSUE_ROOT',
          inputs,
          { burnAddress: burnInfo.address, burnSats, changeAddress, changeSats: xnaChangeSats },
          {
            toAddress,
            assetName,
            quantityRaw: this.assetAmountToRaw(quantity, units, 'quantity'),
            units,
            reissuable,
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            ownerTokenAddress: changeAddress
          }
        ),
        localRawBuild: await this.buildLocalRawBuild(
          'ISSUE_ROOT',
          inputs,
          burnInfo,
          changeAddress,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, units),
            units,
            reissuable,
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            ownerTokenAddress: changeAddress
          }
        )
      }
    );
  }
}

module.exports = IssueRootBuilder;
