// Browser entry: `@neuraiproject/neurai-assets/browser`.
import NeuraiAssets, { utils } from "@neuraiproject/neurai-assets/browser";

export const assets = new NeuraiAssets(async () => null, { network: "xna-test" });
export const kind = utils.FeeSizing.getAddressKind("tnq1rwentz4njukcn400flwk5tu6s8fmzwd3e408nmkqz6dvfysgcdp2suqptef");
