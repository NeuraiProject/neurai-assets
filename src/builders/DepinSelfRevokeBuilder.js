/**
 * DePIN Self-Revoke Builder
 *
 * Un dispositivo renuncia a su propio asset DePIN. No hace falta el token
 * owner: la prueba de que uno es el titular es GASTAR su propia UTXO del
 * asset, que vuelve a la misma dirección junto con la marca de revocación.
 *
 * Sólo el owner puede deshacerlo (`unfreezeAddresses`). Si la dirección que se
 * revoca sostiene además el token owner, nadie podrá: por eso se rechaza aquí.
 *
 * Estructura (create-transaction `SELF_REVOKE_DEPIN`):
 * - una autotransferencia de "&X" a la propia dirección
 * - una salida de datos nulos con flag 1
 * - sin quema y sin token owner
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { toProtocolInteger } = require('../utils/assetAmount');
const { AssetNotFoundError, InvalidAddressError } = require('../errors');

class DepinSelfRevokeBuilder extends BaseAssetTransactionBuilder {
  /**
   * @param {object} params - Parámetros
   * @throws {Error} Si la validación falla
   */
  validateParams(params) {
    if (!params.assetName) {
      throw new Error('assetName is required');
    }
    if (!AssetNameParser.isDepin(params.assetName)) {
      throw new Error(
        `selfRevokeDepin only applies to DEPIN assets (&NAME); got ${params.assetName}`
      );
    }
    this.validateAssetName(params.assetName, 'DEPIN');

    if (params.holderAddress !== undefined && typeof params.holderAddress !== 'string') {
      throw new InvalidAddressError('holderAddress must be a string', params.holderAddress);
    }
    return true;
  }

  /**
   * @returns {Promise<object>} Resultado de la transacción
   */
  async build() {
    await this.validateParams(this.params);

    const { assetName } = this.params;

    const assetData = await this.getAssetData(assetName);
    if (!assetData) {
      throw new AssetNotFoundError(
        `Asset ${assetName} does not exist on the blockchain`,
        assetName
      );
    }

    const addresses = await this._getAddresses();
    const changeAddress = await this.getChangeAddress();

    // La UTXO del asset que se va a gastar: es la prueba de titularidad.
    const selection = await this.utxoSelector.selectAssetUTXOs(addresses, assetName, 1);
    if (!selection.utxos || selection.utxos.length === 0) {
      throw new AssetNotFoundError(
        `This wallet holds no ${assetName} to revoke`,
        assetName
      );
    }

    // Una sola UTXO y su dirección: la marca de revocación va dirigida a ella,
    // así que mezclar varias direcciones produciría una revocación ambigua.
    const assetUTXO = selection.utxos[0];
    const holderAddress = this.params.holderAddress || assetUTXO.address;
    if (assetUTXO.address !== holderAddress) {
      throw new Error(
        `The ${assetName} UTXO lives on ${assetUTXO.address}, not on ${holderAddress}: ` +
        `revoke from the address that holds it.`
      );
    }

    // Revocarse teniendo el token owner deja el asset sin nadie que pueda
    // deshacerlo. El nodo aplica la misma regla (rpc/assets.cpp:106).
    const ownerTokenName = AssetNameParser.getOwnerTokenName(assetName);
    const ownerUTXOs = await this.utxoSelector.getUTXOs([holderAddress], ownerTokenName);
    if (ownerUTXOs.length > 0) {
      throw new Error(
        `${holderAddress} also holds the owner token ${ownerTokenName}. Move it to another ` +
        `address first, or nobody will be able to undo this revocation.`
      );
    }

    const amountRaw = toProtocolInteger(assetUTXO.satoshis, 'asset utxo satoshis');

    const outputAddresses = [
      changeAddress,
      { address: holderAddress, assetName },
      { address: holderAddress, assetName, kind: 'restriction' }
    ];
    const funding = await this.fundXnaInputs({
      outputs: outputAddresses,
      extraInputs: [assetUTXO],
      exclude: [assetUTXO]
    });

    const baseCurrencyUTXOs = funding.utxos;
    const actualFee = this.satsToDisplay(funding.feeSats);
    const xnaChangeSats = funding.changeSats;

    const inputs = baseCurrencyUTXOs.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.outputIndex,
      address: utxo.address,
      satoshis: utxo.satoshis
    }));
    inputs.push({
      txid: assetUTXO.txid,
      vout: assetUTXO.outputIndex,
      address: assetUTXO.address,
      assetName: assetUTXO.assetName,
      satoshis: assetUTXO.satoshis
    });

    const outputs = [];
    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
    }
    outputs.push({
      [holderAddress]: OutputFormatter.formatTransferOutput(assetName, Number(amountRaw))
    });
    outputs.push({
      [holderAddress]: OutputFormatter.formatFreezeAddressesOutput({
        asset_name: assetName,
        addresses: [holderAddress]
      })
    });

    const orderedOutputs = this.outputOrderer.order(outputs);

    const createTransactionBuild = await this.buildCreateTransactionBuild(
      'SELF_REVOKE_DEPIN',
      inputs,
      { changeAddress, changeSats: xnaChangeSats },
      { assetName, holderAddress, amountRaw, network: this.canonicalNetwork() }
    );

    // El `createrawtransaction` del nodo no sabe expresar esta operación, así
    // que el hex sale del códec local; el nodo sí acepta el resultado.
    const rawTx = this.buildRawTransactionLocally(createTransactionBuild);

    return this.formatResult(
      rawTx,
      [...baseCurrencyUTXOs, assetUTXO],
      inputs,
      orderedOutputs,
      actualFee,
      0,
      {
        assetName,
        holderAddress,
        operationType: 'SELF_REVOKE_DEPIN',
        buildStrategy: 'local-builder',
        createTransactionBuild
      }
    );
  }
}

module.exports = DepinSelfRevokeBuilder;
