// CommonJS consumer: resolves the `require` condition (dist/index.d.cts).
// Every value export is used, so a missing declaration fails to compile.
import assets = require("@neuraiproject/neurai-assets");

export const values = [
  assets.AssetQueries, assets.NeuraiAssets, assets.builders, assets.constants,
  assets.default, assets.errors, assets.utils, assets.validators,
];
const rpc = async (): Promise<unknown> => null;
export const instance: assets.NeuraiAssets = new assets.default(rpc, { network: "xna-test" });
export const vbytes: number = assets.utils.FeeSizing.VBYTES.ecdsaWitnessInputVbytes;
export type Kind = assets.AddressKind;
