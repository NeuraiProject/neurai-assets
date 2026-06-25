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

    const { assetName, recipients } = this.params;

    // Total amount to send, in user-facing asset units (NOT raw 10^8 sats).
    // selectAssetUTXOs / the createrawtransaction transfer output both expect
    // display units and scale by 10^8 themselves — pre-multiplying would
    // double-scale (see UTXOSelector.selectAssetUTXOs / BaseBuilder.toSatoshis).
    const totalAssetUnits = recipients.reduce((sum, r) => sum + r.amount, 0);

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
      ...recipients.map(r => r.address), // one transfer per recipient
      changeAddress, // asset change (harmless over-count if absent)
      ...(isDepin ? [changeAddress] : []), // owner token return
    ];

    // 5. First (rough) fee estimate, then select asset + XNA UTXOs.
    const estimatedFee = await this.estimateFee(isDepin ? 3 : 2, outputAddresses);
    const utxoSelection = await this.selectUTXOs(estimatedFee, assetName, totalAssetUnits);
    const assetUTXOs = utxoSelection.assetUTXOs;
    const baseCurrencyUTXOs = utxoSelection.xnaUTXOs;
    let totalXNAInput = utxoSelection.totalXNA;

    // Asset change computed in raw 10^8-sats to avoid float drift, then back to units.
    const assetInputRawSats = assetUTXOs.reduce((sum, u) => sum + u.satoshis, 0);
    const totalAssetRawSats = Math.round(totalAssetUnits * 100000000);
    const assetChangeRawSats = assetInputRawSats - totalAssetRawSats;
    const assetChangeUnits = assetChangeRawSats / 100000000;

    // 6. Recompute the fee with the real inputs (PQ-aware), including the owner
    //    token when DePIN, then top up XNA if the rough estimate fell short.
    const actualFeeInputs = [
      ...baseCurrencyUTXOs,
      ...assetUTXOs,
      ...(isDepin ? [ownerTokenUTXO] : []),
    ];
    const actualFee = await this.estimateFee(actualFeeInputs, outputAddresses);

    if (totalXNAInput < actualFee) {
      const additionalNeeded = actualFee - totalXNAInput + 0.001;
      const additionalSelection = await this.selectUTXOs(additionalNeeded, null, 0);
      baseCurrencyUTXOs.push(...additionalSelection.xnaUTXOs);
      totalXNAInput += additionalSelection.totalXNA;
    }

    // 7. XNA change (no burn for a transfer)
    const finalXNAInput = baseCurrencyUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis / 100000000,
      0
    );
    const xnaChange = finalXNAInput - actualFee;

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

    // 9. Build outputs (unordered — outputOrderer enforces protocol order)
    const outputs = [];

    // XNA change
    if (xnaChange > 0.00000001) {
      outputs.push({ [changeAddress]: parseFloat(xnaChange.toFixed(8)) });
    }

    // One transfer per recipient (display units; the daemon scales by 10^8)
    recipients.forEach(r => {
      outputs.push({ [r.address]: OutputFormatter.formatTransferOutput(assetName, r.amount) });
    });

    // Asset change back to the sender
    if (assetChangeRawSats > 0) {
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
    const xnaChangeOut = xnaChange > 0.00000001 ? parseFloat(xnaChange.toFixed(8)) : null;

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
        assetChange: assetChangeRawSats > 0 ? assetChangeUnits : 0,
        isDepin,
        ownerTokenUsed: isDepin ? ownerTokenName : null,
        operationType: 'TRANSFER',
        localRawBuild: this.buildLocalRawBuild(
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
            assetChange: assetChangeRawSats > 0
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
