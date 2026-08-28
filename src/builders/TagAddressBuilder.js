/**
 * Tag Address Builder
 * Builds transactions for tagging/untagging addresses with qualifiers
 *
 * Tag operations:
 * - Assign qualifier tags to addresses (for restricted asset compliance)
 * - Remove qualifier tags from addresses
 * - Cost: 0.1 XNA per address (burned)
 * - Requires spending the qualifier asset itself (#QUALIFIER)
 * - Used to mark addresses as KYC'd, accredited, etc.
 * - Owner token must be returned
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter } = require('../utils');
const { AssetNotFoundError, OwnerTokenNotFoundError, InvalidAddressError } = require('../errors');

class TagAddressBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate tag/untag parameters
   * @param {object} params - Tag parameters
   * @param {boolean} isUntag - True if untag operation
   * @throws {Error} If validation fails
   */
  validateParams(params, isUntag = false) {
    // Validate required parameters
    if (!params.qualifierName) {
      throw new Error('qualifierName is required');
    }

    if (!params.addresses || !Array.isArray(params.addresses) || params.addresses.length === 0) {
      throw new Error('addresses is required and must be a non-empty array');
    }

    if (params.addresses.length > 10) {
      throw new Error('addresses array cannot exceed 10 entries per transaction (node limit)');
    }

    // Validate qualifier name
    this.validateAssetName(params.qualifierName, 'QUALIFIER');

    // Validate addresses
    params.addresses.forEach((address, index) => {
      if (!address || typeof address !== 'string') {
        throw new InvalidAddressError(
          `addresses[${index}] must be a non-empty string`,
          address
        );
      }

      // Address prefix validation is left to the node (varies by network)
    });

    return true;
  }

  /**
   * Build tag addresses transaction
   * @param {boolean} isUntag - True for untag operation, false for tag
   * @returns {Promise<object>} Transaction result
   */
  async buildTagOperation(isUntag = false) {
    // 1. Validate parameters
    await this.validateParams(this.params, isUntag);

    const {
      qualifierName,
      addresses: targetAddresses,
    } = this.params;

    // 2. Check if qualifier exists
    const qualifierExists = await this.assetExists(qualifierName);
    if (!qualifierExists) {
      throw new AssetNotFoundError(
        `Qualifier ${qualifierName} does not exist. You must create the qualifier first.`,
        qualifierName
      );
    }

    // 3. Get wallet addresses
    const addresses = await this._getAddresses();
    const changeAddress = await this.getChangeAddress();

    // 4. Find qualifier asset balance (CRITICAL: must have this)
    let qualifierUTXOs;
    let qualifierQuantity;
    try {
      const selection = await this.utxoSelector.selectAssetUTXOs(addresses, qualifierName, 1);
      qualifierUTXOs = selection.utxos;
      qualifierQuantity = selection.totalAmount;
    } catch (error) {
      if (error.name === 'InsufficientFundsError') {
        throw new OwnerTokenNotFoundError(
          `You must own the qualifier asset (${qualifierName}) to tag/untag addresses.`,
          qualifierName
        );
      }
      throw error;
    }

    // 5. Get burn information (0.1 XNA per address)
    const addressCount = targetAddresses.length;
    const burnInfo = isUntag
      ? this.burnManager.getUntagAddressBurn(addressCount)
      : this.burnManager.getTagAddressBurn(addressCount);

    // 6. Estimate fee
    // Outputs: burn + XNA change + tag/untag operation (sent to changeAddress)
    // Las salidas de asset deben describirse como lo que el nodo serializa.
    // Como direcciones desnudas se contaban 34 bytes por salida y el payload
    // entero quedaba sin pagar; las de datos nulos (tag, congelación,
    // verificador) ni siquiera llevan destino: su script SUSTITUYE al P2PKH.
    const outputAddresses = [
      burnInfo.address,
      changeAddress,
      // El nodo devuelve el resto del qualifier a la dirección de cambio.
      { address: changeAddress, assetName: qualifierName },
      // Una salida de datos nulos por dirección etiquetada.
      ...targetAddresses.map(target => ({
        address: target, assetName: qualifierName, kind: 'tag'
      }))
    ];
    // 7-11. Fund the XNA side. The qualifier inputs count towards the size
    //       estimate from the first round and are excluded from XNA selection.
    const burnSats = this.xnaAmountToSats(burnInfo.amount, { label: 'burn amount' });
    const funding = await this.fundXnaInputs({
      outputs: outputAddresses,
      burnSats,
      extraInputs: qualifierUTXOs,
      exclude: qualifierUTXOs,
      initialInputHint: 1
    });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

    // 12. Build inputs (XNA + qualifier asset)
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

    qualifierUTXOs.forEach(utxo => {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.outputIndex,
        address: utxo.address,
        assetName: utxo.assetName,
        satoshis: utxo.satoshis
      });
    });

    // 13. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
    }

    // Last: Tag/Untag operation. The node creates the qualifier change output
    // from the operation object itself, so this must be sent to the change address.
    const operationOutput = isUntag
      ? OutputFormatter.formatUntagAddressesOutput({
          qualifier: qualifierName,
          addresses: targetAddresses,
          change_quantity: this.toSatoshis(qualifierQuantity, 0)
        })
      : OutputFormatter.formatTagAddressesOutput({
          qualifier: qualifierName,
          addresses: targetAddresses,
          change_quantity: this.toSatoshis(qualifierQuantity, 0)
        });

    outputs.push({ [changeAddress]: operationOutput });

    // 14. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 15. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 16. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ...qualifierUTXOs];

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnInfo.amount,
      {
        qualifierName,
        qualifierAssetUsed: qualifierName,
        targetAddresses,
        addressCount,
        operationType: isUntag ? 'UNTAG_ADDRESSES' : 'TAG_ADDRESSES',
        createTransactionBuild: await this.buildCreateTransactionBuild(
          isUntag ? 'UNTAG_ADDRESSES' : 'TAG_ADDRESSES',
          inputs,
          { burnAddress: burnInfo.address, burnSats, changeAddress, changeSats: xnaChangeSats },
          {
            qualifierName,
            targetAddresses,
            qualifierChangeAddress: changeAddress,
            qualifierChangeAmountRaw: this.assetAmountToRaw(
              qualifierQuantity,
              0,
              'qualifier change'
            )
          }
        ),
        localRawBuild: await this.buildLocalRawBuild(
          isUntag ? 'UNTAG_ADDRESSES' : 'TAG_ADDRESSES',
          inputs,
          burnInfo,
          changeAddress,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          {
            qualifierName,
            targetAddresses,
            qualifierChangeAddress: changeAddress,
            qualifierChangeAmountRaw: this.toSatoshis(qualifierQuantity, 0)
          }
        )
      }
    );
  }

  /**
   * Build tag addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    return this.buildTagOperation(false);
  }

  /**
   * Build untag addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildUntag() {
    return this.buildTagOperation(true);
  }
}

module.exports = TagAddressBuilder;
