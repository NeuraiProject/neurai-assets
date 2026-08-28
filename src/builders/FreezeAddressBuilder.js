/**
 * Freeze Address Builder
 * Builds transactions for freezing/unfreezing addresses and assets
 *
 * Freeze operations (restricted assets only):
 * - Freeze specific addresses (prevent trading)
 * - Unfreeze specific addresses (allow trading again)
 * - Global asset freeze (freeze entire asset)
 * - Global asset unfreeze (unfreeze entire asset)
 * - Cost: No burn (but requires fee)
 * - Requires restricted asset's owner token ($ASSET!)
 * - Owner token must be returned
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { AssetNotFoundError, OwnerTokenNotFoundError, InvalidAddressError } = require('../errors');

class FreezeAddressBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate freeze/unfreeze parameters
   * @param {object} params - Freeze parameters
   * @param {string} operationType - Operation type
   * @throws {Error} If validation fails
   */
  validateParams(params, operationType) {
    // Validate required parameters
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    // Validate asset name is restricted
    this.validateAssetName(params.assetName, 'RESTRICTED');

    // For address-specific operations, validate addresses
    if (operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES') {
      if (!params.addresses || !Array.isArray(params.addresses) || params.addresses.length === 0) {
        throw new Error('addresses is required and must be a non-empty array');
      }

      // Validate each address
      params.addresses.forEach((address, index) => {
        if (!address || typeof address !== 'string') {
          throw new InvalidAddressError(
            `addresses[${index}] must be a non-empty string`,
            address
          );
        }

        // Address prefix validation is left to the node (varies by network)
      });
    }

    return true;
  }

  /**
   * Build freeze operation transaction
   * @param {string} operationType - Operation type
   * @returns {Promise<object>} Transaction result
   */
  async buildFreezeOperation(operationType) {
    // 1. Validate parameters
    await this.validateParams(this.params, operationType);

    const { assetName } = this.params;

    // El token owner no depende de nada de lo que sigue: pedirlo a la vez que
    // las lecturas del asset ahorra una ida y vuelta completa. Se ESPERA en su
    // sitio de siempre, así que el orden de los errores no cambia.
    const ownerTokenName = AssetNameParser.getOwnerTokenName(assetName);
    const addresses = await this._getAddresses();
    const ownerTokenLookup = this.ownerTokenManager.findOwnerTokenUTXO(
      ownerTokenName,
      addresses
    );
    ownerTokenLookup.catch(() => {});

    // 2. Check if asset exists and is restricted
    const assetData = await this.getAssetData(assetName);
    if (!assetData) {
      throw new AssetNotFoundError(
        `Asset ${assetName} does not exist on the blockchain`,
        assetName
      );
    }

    // 3. Get wallet addresses
    const changeAddress = await this.getChangeAddress();

    // 4. Find owner token (CRITICAL: must have this)
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await ownerTokenLookup;
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the restricted asset's owner token (${ownerTokenName}) to freeze/unfreeze addresses or the asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 5. No burn for freeze operations (only fee)
    const burnAmount = 0;

    // 6. Estimate fee
    // Outputs: XNA change + freeze/unfreeze operation (sent to changeAddress)
    // Las salidas de asset deben describirse como lo que el nodo serializa.
    // Como direcciones desnudas se contaban 34 bytes por salida y el payload
    // entero quedaba sin pagar; las de datos nulos (tag, congelación,
    // verificador) ni siquiera llevan destino: su script SUSTITUYE al P2PKH.
    const isGlobal = operationType === 'FREEZE_ASSET' || operationType === 'UNFREEZE_ASSET';
    const frozenAddresses = isGlobal ? [] : (this.params.addresses || []);
    const outputAddresses = [
      changeAddress,
      // El token owner se gasta y se devuelve: transferencia.
      { address: changeAddress, assetName: ownerTokenName },
      ...(isGlobal
        ? [{ assetName, kind: 'globalRestriction' }]
        : frozenAddresses.map(target => ({
            address: target, assetName, kind: 'restriction'
          })))
    ];
    // 7-10. Fund the XNA side (fee only, this operation does not burn). The
    //       owner-token input counts towards the size estimate from the first
    //       round and is excluded from XNA selection.
    const funding = await this.fundXnaInputs({
      outputs: outputAddresses,
      extraInputs: [ownerTokenUTXO],
      exclude: [ownerTokenUTXO],
      initialInputHint: 1
    });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

    // 11. Build inputs (XNA + owner token)
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

    // 12. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: XNA change (if any)
    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
    }

    // Last: Freeze/Unfreeze operation
    let operationOutput;
    let targetAddresses = [];

    switch (operationType) {
      case 'FREEZE_ADDRESSES':
        targetAddresses = this.params.addresses;
        operationOutput = OutputFormatter.formatFreezeAddressesOutput({
          asset_name: assetName,
          addresses: targetAddresses
        });
        outputs.push({ [changeAddress]: operationOutput });
        break;

      case 'UNFREEZE_ADDRESSES':
        targetAddresses = this.params.addresses;
        operationOutput = OutputFormatter.formatUnfreezeAddressesOutput({
          asset_name: assetName,
          addresses: targetAddresses
        });
        outputs.push({ [changeAddress]: operationOutput });
        break;

      case 'FREEZE_ASSET':
        operationOutput = OutputFormatter.formatFreezeAssetOutput(assetName);
        outputs.push({ [changeAddress]: operationOutput });
        break;

      case 'UNFREEZE_ASSET':
        operationOutput = OutputFormatter.formatUnfreezeAssetOutput(assetName);
        outputs.push({ [changeAddress]: operationOutput });
        break;

      default:
        throw new Error(`Unknown freeze operation type: ${operationType}`);
    }

    // 13. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 14. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 15. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      burnAmount,
      {
        assetName,
        ownerTokenUsed: ownerTokenName,
        targetAddresses: targetAddresses.length > 0 ? targetAddresses : null,
        addressCount: targetAddresses.length,
        operationType,
        createTransactionBuild: await this.buildCreateTransactionBuild(
          operationType,
          inputs,
          { changeAddress, changeSats: xnaChangeSats },
          operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES'
            ? {
                assetName,
                targetAddresses,
                ownerChangeAddress: changeAddress
              }
            : {
                assetName,
                ownerChangeAddress: changeAddress
              }
        ),
        localRawBuild: await this.buildLocalRawBuild(
          operationType,
          inputs,
          null,
          xnaChangeSats > 0n ? changeAddress : null,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES'
            ? {
                assetName,
                targetAddresses,
                ownerChangeAddress: changeAddress
              }
            : {
                assetName,
                ownerChangeAddress: changeAddress
              }
        )
      }
    );
  }

  /**
   * Build freeze addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    return this.buildFreezeOperation('FREEZE_ADDRESSES');
  }

  /**
   * Build unfreeze addresses transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildUnfreeze() {
    return this.buildFreezeOperation('UNFREEZE_ADDRESSES');
  }

  /**
   * Build global freeze asset transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildGlobalFreeze() {
    return this.buildFreezeOperation('FREEZE_ASSET');
  }

  /**
   * Build global unfreeze asset transaction
   * @returns {Promise<object>} Transaction result
   */
  async buildGlobalUnfreeze() {
    return this.buildFreezeOperation('UNFREEZE_ASSET');
  }
}

module.exports = FreezeAddressBuilder;
