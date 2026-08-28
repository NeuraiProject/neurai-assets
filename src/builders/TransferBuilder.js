/**
 * Transfer Builder
 * Builds transactions that transfer an existing asset to one or more recipients.
 *
 * Works for any asset type (regular, sub, restricted, DePIN). The only
 * type-specific rule lives in Neurai consensus for DePIN (`&`) assets, which are
 * soulbound: a DePIN transfer is only valid if the same transaction
 *   1. SPENDS the asset's owner token `&NAME!` as an input, and
 *   2. re-creates (transfers) that owner token in an output.
 * See Neurai-DePIN/src/consensus/tx_verify.cpp (bad-txns-depin-transfer-not-by-owner).
 * For non-DePIN assets no owner token is required for a plain transfer.
 *
 * Owner-token destination: the owner token is returned to the sender's change
 * address — the asset moves to the recipient but authority stays with the owner
 * (soulbound semantics). Transferring ownership itself is out of scope here.
 *
 * This builder mirrors ReissueBuilder (which also spends + returns an owner
 * token) but, since a transfer has no reissue entry, it adds the owner-token
 * return output explicitly via OwnerTokenManager.
 */

const BaseAssetTransactionBuilder = require('./BaseAssetTransactionBuilder');
const { OutputFormatter, AssetNameParser } = require('../utils');
const { OwnerTokenNotFoundError } = require('../errors');

class TransferBuilder extends BaseAssetTransactionBuilder {
  /**
   * Validate transfer parameters
   * @param {object} params - Transfer parameters
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    if (!params.assetName) {
      throw new Error('assetName is required');
    }

    if (!Array.isArray(params.recipients) || params.recipients.length === 0) {
      throw new Error('recipients is required (non-empty array of { address, amount })');
    }

    params.recipients.forEach((recipient, index) => {
      if (!recipient || !recipient.address) {
        throw new Error(`recipients[${index}].address is required`);
      }
      if (recipient.amount === undefined || recipient.amount === null) {
        throw new Error(`recipients[${index}].amount is required`);
      }
      if (recipient.amount <= 0) {
        throw new Error(`recipients[${index}].amount must be greater than 0`);
      }
    });

    return true;
  }

  /**
   * Build transfer transaction
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    // 1. Validate parameters
    this.validateParams(this.params);

    const { assetName, recipients, units } = this.params;

    // Every recipient is converted to its protocol integer FIRST and the
    // totals are summed in raw. Summing display amounts and scaling the total
    // afterwards (`Math.round(totalAssetUnits * 1e8)`) accumulates the float
    // error of every recipient into the asset change.
    const recipientsRaw = recipients.map((recipient, index) => ({
      address: recipient.address,
      assetName,
      amountRaw: this.assetAmountToRaw(
        recipient.amount,
        units,
        `recipients[${index}].amount`
      )
    }));
    const totalRecipientRaw = recipientsRaw.reduce((sum, r) => sum + r.amountRaw, 0n);

    // 2. Addresses
    const addresses = await this._getAddresses();
    const changeAddress = await this.getChangeAddress();

    // 3. DePIN detection + owner token lookup (soulbound rule)
    const isDepin = AssetNameParser.isDepin(assetName);
    let ownerTokenName = null;
    let ownerTokenUTXO = null;
    if (isDepin) {
      ownerTokenName = AssetNameParser.getOwnerTokenName(assetName); // &NAME -> &NAME!
      try {
        ownerTokenUTXO = await this.ownerTokenManager.findOwnerTokenUTXO(
          ownerTokenName,
          addresses
        );
      } catch (error) {
        if (error instanceof OwnerTokenNotFoundError) {
          throw new OwnerTokenNotFoundError(
            `You must own the asset's owner token (${ownerTokenName}) to transfer ` +
            `this DePIN asset. DePIN assets are soulbound: the transfer must be ` +
            `authorized by the owner.`,
            ownerTokenName
          );
        }
        throw error;
      }
    }

    // 4. Output addresses used only for the fee (vsize) estimate. Include every
    //    potential output so the fee is never under-estimated.
    const outputAddresses = [
      changeAddress, // XNA change
      // One transfer per recipient. These carry an asset payload, so they must
      // be declared as such: sized as bare P2PKH the fee falls below the node's
      // minimum relay fee as soon as its fee rate approaches that floor.
      ...recipients.map(r => ({ address: r.address, assetName })),
      { address: changeAddress, assetName }, // asset change (harmless over-count if absent)
      ...(isDepin
        // Escolta: se gasta y se devuelve, luego es una transferencia.
        ? [{ address: changeAddress, assetName: ownerTokenName }]
        : []),
    ];

    // 5. Select the asset UTXOs from the raw total, so the requirement is not
    //    a display float that was scaled back up.
    const assetSelection = await this.utxoSelector.selectAssetUTXOs(
      addresses,
      assetName,
      undefined,
      { requiredRaw: totalRecipientRaw }
    );
    const assetUTXOs = assetSelection.utxos;
    const assetChangeRaw = assetSelection.totalRaw - totalRecipientRaw;

    // 6. Fund the XNA side. The asset and owner-token inputs count towards the
    //    size estimate from the first round (they are what makes a PQ transfer
    //    expensive) and are excluded from XNA selection. fundXnaInputs
    //    recomputes the fee after every top-up and never reuses an outpoint.
    const committedInputs = [...assetUTXOs, ...(isDepin ? [ownerTokenUTXO] : [])];
    const funding = await this.fundXnaInputs({
      outputs: outputAddresses,
      extraInputs: committedInputs,
      exclude: committedInputs,
      initialInputHint: 1
    });

    const baseCurrencyUTXOs = funding.utxos;
    const feeSats = funding.feeSats;
    const xnaChangeSats = funding.changeSats;
    const actualFee = this.satsToDisplay(feeSats);

    // 8. Build inputs: asset UTXOs + [owner token] + XNA UTXOs
    const inputs = [];

    assetUTXOs.forEach(utxo => {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.outputIndex,
        address: utxo.address,
        assetName: utxo.assetName,
        satoshis: utxo.satoshis,
      });
    });

    if (isDepin) {
      inputs.push({
        txid: ownerTokenUTXO.txid,
        vout: ownerTokenUTXO.outputIndex,
        address: ownerTokenUTXO.address,
        assetName: ownerTokenUTXO.assetName,
        satoshis: ownerTokenUTXO.satoshis,
      });
    }

    baseCurrencyUTXOs.forEach(utxo => {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.outputIndex,
        address: utxo.address,
        satoshis: utxo.satoshis,
      });
    });

    // 9. Build outputs (unordered — outputOrderer enforces protocol order).
    //    These carry DISPLAY amounts: createrawtransaction runs them through
    //    AmountFromValue and does the 10^8 scaling itself.
    const outputs = [];
    const hasXnaChange = xnaChangeSats > 0n;
    const assetChangeUnits = assetChangeRaw > 0n ? this.satsToDisplay(assetChangeRaw) : 0;

    // XNA change
    if (hasXnaChange) {
      outputs.push({ [changeAddress]: this.satsToDisplay(xnaChangeSats) });
    }

    // One transfer per recipient (display units; the daemon scales by 10^8)
    recipients.forEach(r => {
      outputs.push({ [r.address]: OutputFormatter.formatTransferOutput(assetName, r.amount) });
    });

    // Asset change back to the sender
    if (assetChangeRaw > 0n) {
      outputs.push({
        [changeAddress]: OutputFormatter.formatTransferOutput(assetName, assetChangeUnits),
      });
    }

    // DePIN: return the owner token (required so the tx contains a transfer of
    // &NAME! — satisfies the consensus `transfersOwnerToken` check).
    if (isDepin) {
      outputs.push(
        this.ownerTokenManager.createOwnerTokenReturnOutput(ownerTokenName, changeAddress)
      );
    }

    // 10. Order outputs (protocol requirement)
    const orderedOutputs = this.outputOrderer.order(outputs);

    // 11. Create raw transaction
    const rawTx = await this.buildRawTransaction(inputs, orderedOutputs);

    // 12. Format and return result
    const allUTXOs = [
      ...assetUTXOs,
      ...(isDepin ? [ownerTokenUTXO] : []),
      ...baseCurrencyUTXOs,
    ];
    const xnaChangeOut = hasXnaChange ? this.satsToDisplay(xnaChangeSats) : null;

    // Canonical transfers: recipients plus, at most, one asset change. The
    // DePIN owner escort is NOT listed here — createDepinTransferTransaction
    // emits it itself, and adding it would produce two "&NAME!" outputs.
    const canonicalTransfers = [
      ...recipientsRaw,
      ...(assetChangeRaw > 0n
        ? [{ address: changeAddress, assetName, amountRaw: assetChangeRaw }]
        : [])
    ];

    const createTransactionBuild = isDepin
      ? await this.buildCreateTransactionBuild(
          'TRANSFER_DEPIN',
          inputs,
          { changeAddress, changeSats: xnaChangeSats },
          {
            transfers: canonicalTransfers,
            ownerChangeAddress: changeAddress,
            network: this.canonicalNetwork()
          }
        )
      : await this.buildCreateTransactionBuild(
          'STANDARD_TRANSFER',
          inputs,
          {}, // STANDARD_TRANSFER has no XNA envelope; change travels as a payment
          {
            payments: hasXnaChange
              ? [{ address: changeAddress, valueSats: xnaChangeSats }]
              : [],
            transfers: canonicalTransfers
          }
        );

    return this.formatResult(
      rawTx,
      allUTXOs,
      inputs,
      orderedOutputs,
      actualFee,
      0, // burnAmount — transfers don't burn
      {
        assetName,
        recipients: recipients.map(r => ({ address: r.address, amount: r.amount })),
        assetChange: assetChangeUnits,
        isDepin,
        ownerTokenUsed: isDepin ? ownerTokenName : null,
        operationType: 'TRANSFER',
        createTransactionBuild,
        localRawBuild: await this.buildLocalRawBuild(
          'TRANSFER',
          inputs,
          null, // no burn
          changeAddress,
          xnaChangeOut,
          {
            assetName,
            transfers: recipients.map(r => ({
              address: r.address,
              assetName,
              amount: r.amount,
            })),
            assetChange: assetChangeRaw > 0n
              ? { address: changeAddress, assetName, amount: assetChangeUnits }
              : null,
            ownerReturn: isDepin
              ? { address: changeAddress, assetName: ownerTokenName, amount: 1 }
              : null,
          }
        ),
      }
    );
  }
}

module.exports = TransferBuilder;
