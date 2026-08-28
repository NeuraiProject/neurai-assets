/**
 * Reissue Builder
 * Builds transactions for reissuing (minting more supply) assets
 *
 * Reissue:
 * - Mints additional supply of an existing asset
 * - Cost: 200 XNA (burned)
 * - Requires asset's owner token (ASSET!)
 * - Can lock asset (make it non-reissuable)
 * - Can update IPFS metadata
 * - Owner token must be returned
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const {
  AssetNotFoundError,
  AssetNotReissuableError,
  OwnerTokenNotFoundError,
  MaxSupplyExceededError
} = require('../errors');
const { IpfsValidator } = require('../validators');
const { ASSET_LIMITS } = require('../constants');

class ReissueBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate reissue parameters
   * @param {object} params - Reissue parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    // Validate required parameters
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    if (params.quantity === undefined || params.quantity === null) {
      throw new Error('quantity is required (amount to mint)');
    }

    if (params.quantity <= 0) {
      throw new Error('quantity must be greater than 0');
    }

    // Validate new IPFS hash if provided
    if (params.newIpfs) {
      IpfsValidator.validate(params.newIpfs);
    }

    return true;
  }

  /**
   * Build reissue transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      reissuable,
      newIpfs
    } = this.params;

    // El token owner no depende de nada de lo que sigue: pedirlo a la vez que
    // los datos del asset ahorra una ida y vuelta completa. Se ESPERA en su
    // sitio de siempre (paso 6), así que el orden de los errores no cambia:
    // «el asset no existe» y «no es reemitible» se siguen lanzando antes que
    // «no tienes el token owner».
    const ownerTokenName = AssetNameParser.getOwnerTokenName(assetName);
    const addresses = await this._getAddresses();
    const ownerTokenLookup = this.ownerTokenManager.findOwnerTokenUTXO(
      ownerTokenName,
      addresses
    );
    ownerTokenLookup.catch(() => {});

    // 2. Get asset data to verify it exists and is reissuable
    const assetData = await this.getAssetData(assetName);
    if (!assetData) {
      throw new AssetNotFoundError(
        `Asset ${assetName} does not exist on the blockchain`,
        assetName
      );
    }

    // 3. Check if asset is reissuable
    if (!assetData.reissuable) {
      throw new AssetNotReissuableError(
        `Asset ${assetName} is not reissuable. The supply has been locked.`,
        assetName
      );
    }

    // 4. Check if reissuing would exceed max supply
    const currentSupply = assetData.amount || 0;
    const additionalAmount = quantity;
    const newTotalSupply = currentSupply + additionalAmount;

    if (newTotalSupply > ASSET_LIMITS.MAX_QUANTITY) {
      throw new MaxSupplyExceededError(
        `Reissuing ${additionalAmount} would exceed maximum supply. ` +
        `Current: ${currentSupply}, Additional: ${additionalAmount}, ` +
        `Max: ${ASSET_LIMITS.MAX_QUANTITY}`,
        assetName,
        currentSupply,
        additionalAmount,
        ASSET_LIMITS.MAX_QUANTITY
      );
    }

    // 5. Get addresses
    const toAddress = await this.getToAddress();
    const changeAddress = await this.getChangeAddress();
    const isDepinAsset = AssetNameParser.isDepin(assetName);

    // 6. Find owner token (CRITICAL: must have this)
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await ownerTokenLookup;
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the asset's owner token (${ownerTokenName}) to reissue it. ` +
          `The owner token proves you have the right to mint more supply.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 7. Get burn information
    const burnInfo = this.burnManager.getReissueBurn();

    // 8. Estimate fee
    // Inputs: XNA UTXOs + owner token UTXO
    // Outputs: burn + change + owner token return + reissue operation
    const outputAddresses = [
      burnInfo.address,
      changeAddress,
      // El token owner que la operación GASTA y devuelve viaja como
      // transferencia (lleva importe), no con el payload 'owner', que sólo
      // describe el token que una emisión CREA. Estimarlo como 'owner' dejaba
      // la transacción 8 bytes por debajo de lo que el nodo cobra.
      { address: changeAddress, assetName: ownerTokenName },
      { address: toAddress, assetName, kind: 'reissue', hasIpfs: Boolean(newIpfs) },
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

    // 14. Build inputs (XNA + owner token)
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

    // 15. Build outputs (ORDER CRITICAL!)
    const outputs = [];

    // First: Burn output
    outputs.push({ [burnInfo.address]: burnInfo.amount });

    // Second: XNA change (if any)
    if (xnaChangeSats > 0n) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
    }

    // Last: Reissue operation
    // Note: the node auto-generates the owner token return as part of processing
    // the reissue entry — no explicit transfer output needed here.
    const units = assetData.units || 0;
    const reissueOutput = OutputFormatter.formatReissueOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, units),
      reissuable: reissuable !== undefined ? reissuable : undefined,
      new_ipfs: newIpfs || undefined,
      owner_change_address: isDepinAsset ? toAddress : changeAddress
    });

    outputs.push({ [toAddress]: reissueOutput });

    // 16. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 17. Canonical build — also the source of the raw transaction. The
    // node's `createrawtransaction` has no units field for a reissue and
    // assumes 0, so it rejects any asset with units > 0; the local codec
    // encodes "keep the current units" (0xff) and emits the same outputs the
    // node would (owner-token return included), so the RPC is not needed for
    // this step.
    const createTransactionBuild = await this.buildCreateTransactionBuild(
      'REISSUE',
      inputs,
      { burnAddress: burnInfo.address, burnSats, changeAddress, changeSats: xnaChangeSats },
      {
        toAddress,
        assetName,
        quantityRaw: this.assetAmountToRaw(quantity, units, 'quantity'),
        // `units` is deliberately omitted: this library has no API to
        // change an asset's units, so the honest statement is "keep the
        // current ones", which create-transaction >= 0.8.0 encodes as
        // 0xff. Echoing the value read from getassetdata would say "set
        // units to N" instead, and a stale read — the asset reissued to a
        // higher precision between the read and the broadcast — would ask
        // the node to lower them, which it rejects with
        // `unit must be larger than current unit selection`.
        // The value is still used above, to validate that `quantity` fits
        // the asset's precision.
        reissuable: reissuable !== undefined ? reissuable : undefined,
        ipfsHash: newIpfs || undefined,
        ownerChangeAddress: isDepinAsset ? toAddress : changeAddress
      }
    );
    const rawTx = this.buildRawTransactionLocally(createTransactionBuild);

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
        assetName,
        ownerTokenUsed: ownerTokenName,
        quantityMinted: quantity,
        newTotalSupply,
        previousSupply: currentSupply,
        reissuableLocked: reissuable === false,
        operationType: 'REISSUE',
        buildStrategy: 'local-builder',
        createTransactionBuild,
        localRawBuild: await this.buildLocalRawBuild(
          'REISSUE',
          inputs,
          burnInfo,
          changeAddress,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, units),
            units,
            reissuable: reissuable !== undefined ? reissuable : undefined,
            ipfsHash: newIpfs || undefined,
            ownerChangeAddress: isDepinAsset ? toAddress : changeAddress
          }
        )
      }
    );
  }
}

module.exports = ReissueBuilder;
