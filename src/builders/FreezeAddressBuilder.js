/**
 * Freeze Address Builder
 * Builds transactions for freezing/unfreezing addresses and assets
 *
 * Freeze operations (restricted and DEPIN assets):
 * - Freeze specific addresses (prevent trading)
 * - Unfreeze specific addresses (allow trading again)
 * - Global asset freeze (freeze entire asset)
 * - Global asset unfreeze (unfreeze entire asset)
 * - Cost: No burn (but requires fee)
 * - Requires the asset's owner token ($ASSET! or &ASSET!)
 *
 * Un DePIN se congela con la MISMA transacción que un restringido: escolta del
 * token owner más una salida de datos nulos con (nombre, flag). Es literalmente
 * lo que construye el nodo en UpdateDEPINAddressRestriction (rpc/assets.cpp:70),
 * así que comparte builder en vez de tener uno paralelo que acabaría
 * divergiendo.
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

    // Restringido o DePIN: son los dos tipos que el nodo admite aquí
    // (assets.cpp:4496 acepta QUALIFIER, SUB_QUALIFIER, RESTRICTED y DEPIN;
    // los qualifiers usan tag/untag, no esta operación).
    this.validateAssetName(
      params.assetName,
      AssetNameParser.isDepin(params.assetName) ? 'DEPIN' : 'RESTRICTED'
    );

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
    const isDepin = AssetNameParser.isDepin(assetName);

    // La congelación global es de assets restringidos: el nodo la expone como
    // checkglobalrestriction y no tiene equivalente DePIN. Un DePIN se
    // gestiona dispositivo a dispositivo.
    if (isDepin && (operationType === 'FREEZE_ASSET' || operationType === 'UNFREEZE_ASSET')) {
      throw new Error(
        `Global freeze does not apply to DEPIN assets (${assetName}). ` +
        `Freeze the holder addresses instead.`
      );
    }

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
          `You must own the asset's owner token (${ownerTokenName}) to freeze/unfreeze addresses or the asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // La dirección que sostiene el token owner no puede congelarse ni
    // revocarse: el nodo lo rechaza (rpc/assets.cpp:106) y, si se colara,
    // dejaría el asset sin nadie que pudiera descongelarlo. Se comprueba aquí
    // para dar el motivo en vez de un error de consenso.
    const targets = this.params.addresses || [];
    if (targets.includes(ownerTokenUTXO.address)) {
      throw new Error(
        `${ownerTokenUTXO.address} holds the owner token ${ownerTokenName} and cannot be ` +
        `frozen or revoked: nobody would be able to undo it.`
      );
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

    const canonicalParams =
      operationType === 'FREEZE_ADDRESSES' || operationType === 'UNFREEZE_ADDRESSES'
        ? { assetName, targetAddresses, ownerChangeAddress: changeAddress }
        : { assetName, ownerChangeAddress: changeAddress };

    const createTransactionBuild = await this.buildCreateTransactionBuild(
      operationType,
      inputs,
      { changeAddress, changeSats: xnaChangeSats },
      canonicalParams
    );

    // 14. Create raw transaction.
    //
    // Para un DePIN el `createrawtransaction` del nodo no sirve: su objeto
    // freeze_addresses exige un nombre restringido y responde «a valid
    // restricted asset name must be provided». Es un límite de esa interfaz
    // RPC, no de la operación —el nodo acepta la transacción perfectamente—,
    // así que el hex sale del códec local, igual que ya hacen las reemisiones
    // desde 1.5.0. Para restringidos se conserva la ruta de siempre.
    const rawTx = isDepin
      ? this.buildRawTransactionLocally(createTransactionBuild)
      : await this.buildRawTransaction(inputs, orderedOutputs);

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
        buildStrategy: isDepin ? 'local-builder' : undefined,
        createTransactionBuild,
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
