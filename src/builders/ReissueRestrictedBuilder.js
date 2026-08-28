/**
 * Reissue Restricted Builder
 * Builds transactions for reissuing RESTRICTED assets
 *
 * Reissue Restricted:
 * - Mints additional supply of restricted asset
 * - Cost: 200 XNA (burned)
 * - Requires asset's owner token (ASSET!)
 * - Can update verifier string
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
const { IpfsValidator, VerifierValidator } = require('../validators');
const { ASSET_LIMITS } = require('../constants');

class ReissueRestrictedBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate reissue restricted parameters
   * @param {object} params - Reissue parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    // Validate required parameters
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    // Validate asset name is restricted
    this.validateAssetName(params.assetName, 'RESTRICTED');

    if (params.quantity === undefined || params.quantity === null) {
      throw new Error('quantity is required (amount to mint)');
    }

    if (params.quantity <= 0) {
      throw new Error('quantity must be greater than 0');
    }

    // Validate verifier string if changing
    if (params.changeVerifier && params.newVerifier) {
      VerifierValidator.validate(params.newVerifier);
    }

    // Validate new IPFS hash if provided
    if (params.newIpfs) {
      IpfsValidator.validate(params.newIpfs);
    }

    return true;
  }

  /**
   * Build reissue restricted transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    await this.validateParams(this.params);

    const {
      assetName,
      quantity,
      changeVerifier = false,
      newVerifier,
      reissuable,
      newIpfs
    } = this.params;

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

    // 6. Find owner token (CRITICAL: must have this)
    let ownerTokenUTXO;
    try {
      ownerTokenUTXO = await ownerTokenLookup;
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw new OwnerTokenNotFoundError(
          `You must own the asset's owner token (${ownerTokenName}) to reissue it. ` +
          `The owner token proves you have the right to mint more supply and manage the asset.`,
          ownerTokenName
        );
      }
      throw error;
    }

    // 7. Get burn information
    const burnInfo = this.burnManager.getReissueBurn();

    // 8. Estimate fee
    // Las salidas de asset deben describirse como lo que el nodo serializa.
    // Como direcciones desnudas se contaban 34 bytes por salida y el payload
    // entero quedaba sin pagar; las de datos nulos (tag, congelación,
    // verificador) ni siquiera llevan destino: su script SUSTITUYE al P2PKH.
    const outputAddresses = [
      burnInfo.address,
      changeAddress,
      ...(changeVerifier && newVerifier
        ? [{ kind: 'verifier', assetName, verifierString: newVerifier }]
        : []),
      { address: changeAddress, assetName: ownerTokenName },
      { address: toAddress, assetName, kind: 'reissue', hasIpfs: Boolean(this.params.ipfsHash) },
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

    // Last: Reissue restricted operation
    const units = assetData.units || 0;
    const reissueRestrictedOutput = OutputFormatter.formatReissueRestrictedOutput({
      asset_name: assetName,
      asset_quantity: this.toSatoshis(quantity, units),
      change_verifier: changeVerifier,
      new_verifier: changeVerifier ? newVerifier : undefined,
      reissuable: reissuable !== undefined ? reissuable : undefined,
      new_ipfs: newIpfs || undefined,
      owner_change_address: this.params.ownerChangeAddress || changeAddress
    });

    outputs.push({ [toAddress]: reissueRestrictedOutput });

    // 16. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 17. Canonical build — also the source of the raw transaction. Same
    // reasoning as in ReissueBuilder: the node's `createrawtransaction` has no
    // units field for a reissue (the `reissue_restricted` object included), so
    // that path rejects any asset with units > 0; the local codec encodes
    // "keep the current units" (0xff).
    const createTransactionBuild = await this.buildCreateTransactionBuild(
      'REISSUE_RESTRICTED',
      inputs,
      { burnAddress: burnInfo.address, burnSats, changeAddress, changeSats: xnaChangeSats },
      {
        toAddress,
        assetName,
        quantityRaw: this.assetAmountToRaw(quantity, assetData.units || 0, 'quantity'),
        // Omitted on purpose — see the note in ReissueBuilder: this
        // library never changes an asset's units, so it says "keep them"
        // (0xff) rather than echoing a value that could be stale.

        reissuable: reissuable !== undefined ? reissuable : undefined,
        ipfsHash: newIpfs || undefined,
        ownerChangeAddress: this.params.ownerChangeAddress || changeAddress,
        verifierString: changeVerifier ? newVerifier : undefined
      }
    );
    const rawTx = this.buildRawTransactionLocally(createTransactionBuild);

    // 18. Format and return result
    const allUTXOs = [...baseCurrencyUTXOs, ownerTokenUTXO];

    // Extract qualifiers from new verifier if changed
    const requiredQualifiers = changeVerifier && newVerifier
      ? VerifierValidator.extractQualifiers(newVerifier)
      : null;

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
        verifierChanged: changeVerifier,
        newVerifier: changeVerifier ? newVerifier : undefined,
        requiredQualifiers,
        reissuableLocked: reissuable === false,
        operationType: 'REISSUE_RESTRICTED',
        buildStrategy: 'local-builder',
        createTransactionBuild,
        localRawBuild: await this.buildLocalRawBuild(
          'REISSUE_RESTRICTED',
          inputs,
          burnInfo,
          changeAddress,
          xnaChangeSats > 0n ? this.satsToDisplay(xnaChangeSats) : null,
          {
            toAddress,
            assetName,
            quantityRaw: this.toSatoshis(quantity, assetData.units || 0),
            units: assetData.units || 0,
            reissuable: reissuable !== undefined ? reissuable : undefined,
            ipfsHash: newIpfs || undefined,
            ownerChangeAddress: this.params.ownerChangeAddress || changeAddress,
            verifierString: changeVerifier ? newVerifier : undefined
          }
        )
      }
    );
  }
}

module.exports = ReissueRestrictedBuilder;
