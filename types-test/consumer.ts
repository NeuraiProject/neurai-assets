// Compiled by `npm run test:types` against the package declarations, the way
// an ESM application imports it, with skipLibCheck: false.
import NeuraiAssets, { AssetQueries, utils, type AddressKind, type AssetMarker, type FeeSizingUtilities } from "@neuraiproject/neurai-assets";

const rpc = async (): Promise<unknown> => null;
export const assets = new NeuraiAssets(rpc, { network: "xna-authscript-test", addresses: [] });
export const queries: AssetQueries = new AssetQueries(rpc);
const fee: FeeSizingUtilities = utils.FeeSizing;
export const kind: AddressKind = fee.getAddressKind("tpq1z5age5p2v5q9w6qzadkjp4yep8gpr56q6mzd4fu6eus8ntulul6vq3q07pc");
export const marker: AssetMarker = "xna";
export const sameClass: typeof NeuraiAssets.AssetQueries = AssetQueries;
