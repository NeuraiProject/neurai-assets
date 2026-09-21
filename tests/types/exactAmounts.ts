import NeuraiAssets, { utils, errors, type BuildInput, type NeuraiAssetsBuildResult } from '../../index.js';

const raw: bigint = utils.AssetAmount.assetAmountToRaw('100000000.00000001', 8);
const text: string = utils.AssetAmount.formatRawAsDecimal(raw);
const display: number | string = NeuraiAssets.utils.AssetAmount.rawToDisplayAmount(raw);
const error = new errors.InsufficientFundsError('Insufficient funds', text, display);
const amount: number | string = error.required;
const input: BuildInput = { txid: 'fixture', vout: 0, address: 'fixture', satoshis: raw };
input.satoshis = '10000000000000001';
declare const result: NeuraiAssetsBuildResult;
const change: number | string | null = result.changeAmount;
// @ts-expect-error Exact display values must be narrowed before number-only operations.
error.available.toFixed(8);
// @ts-expect-error A raw bigint is not a display amount.
utils.AssetAmount.assetAmountToRaw(1n);
// @ts-expect-error Change can be exact decimal text or null.
const numericChange: number = result.changeAmount;
void [amount, input, change, numericChange];
