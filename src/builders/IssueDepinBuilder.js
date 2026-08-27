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

    const outputAddresses = [
      burnInfo.address,
      changeAddress,
      { address: toAddress, assetName, kind: 'issue', hasIpfs },
      { address: changeAddress, assetName: `${assetName}!`, kind: 'owner' },
    ];
    const burnSats = this.xnaAmountToSats(burnInfo.amount, { label: 'burn amount' });
    const funding = await this.fundXnaInputs({ outputs: outputAddresses, burnSats });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

    const inputs = baseCurrencyUTXOs.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.outputIndex,
      address: utxo.address,
      satoshis: utxo.satoshis
    }));

    const outputs = [];
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
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
        operationType: 'ISSUE_DEPIN',
        createTransactionBuild: await this.buildCreateTransactionBuild(
          'ISSUE_DEPIN',
          inputs,
          { burnAddress: burnInfo.address, burnSats, changeAddress, changeSats: xnaChangeSats },
          {
            toAddress,
            assetName,
            quantityRaw: this.assetAmountToRaw(quantity, 0, 'quantity'),
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            ownerTokenAddress: changeAddress,
            reissuable,
            // Canonical label, so create-transaction's mainnet DePIN guard
            // actually runs: it treats any unknown value (including the alias
            // 'mainnet') as testnet and would let a mainnet build through.
            network: this.canonicalNetwork()
          }
        ),
        localRawBuild: await this.buildLocalRawBuild(
          'ISSUE_DEPIN',
          inputs,
          burnInfo,
          changeAddress,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, 0),
            ipfsHash: hasIpfs ? ipfsHash : undefined,
            ownerTokenAddress: changeAddress,
            reissuable
          }
        )
      }
    );
  }
}

module.exports = IssueDepinBuilder;
