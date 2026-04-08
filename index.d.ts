export interface NeuraiAssetsConfig {
  network?: string;
  addresses?: string[];
  changeAddress?: string | null;
  toAddress?: string | null;
}

export type OperationType =
  | 'ISSUE_ROOT'
  | 'ISSUE_SUB'
  | 'ISSUE_DEPIN'
  | 'ISSUE_UNIQUE'
  | 'ISSUE_QUALIFIER'
  | 'ISSUE_SUB_QUALIFIER'
  | 'ISSUE_RESTRICTED'
  | 'REISSUE'
  | 'REISSUE_RESTRICTED'
  | 'TAG_ADDRESSES'
  | 'UNTAG_ADDRESSES'
  | 'FREEZE_ADDRESSES'
  | 'UNFREEZE_ADDRESSES'
  | 'FREEZE_ASSET'
  | 'UNFREEZE_ASSET';

export type BuildStrategy = 'rpc-node' | 'local-builder';

export interface BuildInput {
  txid: string;
  vout: number;
  address: string;
  satoshis: number;
  assetName?: string;
}

export interface LocalRawBuild {
  operationType: OperationType;
  params: Record<string, unknown>;
}

export interface NeuraiAssetsBuildResult {
  rawTx: string;
  fee: number;
  burnAmount: number;
  network: string;
  buildStrategy: BuildStrategy;
  burnAddress: string | null;
  changeAddress: string | null;
  changeAmount: number | null;
  operationType?: OperationType;
  localRawBuild?: LocalRawBuild;
  inputs: BuildInput[];
  outputs: Array<Record<string, unknown>>;
  utxos?: unknown[];
  assetData?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DepinHolderEntry {
  address: string;
  amount?: number;
  valid?: boolean;
  [key: string]: unknown;
}

export interface DepinValidityResult {
  assetName?: string;
  address: string;
  valid: boolean;
  [key: string]: unknown;
}

export class AssetQueries {
  constructor(rpc: (method: string, params?: unknown[]) => Promise<unknown> | unknown);
  getAssetData(assetName: string): Promise<Record<string, unknown>>;
  listAssets(filter?: string, verbose?: boolean, count?: number, start?: number): Promise<unknown>;
  listMyAssets(assetName?: string, verbose?: boolean, count?: number, start?: number, confs?: number): Promise<Record<string, unknown>>;
  listAddressesByAsset(assetName: string, onlyCount?: boolean, count?: number, start?: number): Promise<unknown>;
  listAssetBalancesByAddress(address: string, onlyTotal?: boolean, count?: number, start?: number): Promise<unknown>;
  checkAddressTag(address: string, qualifierName: string): Promise<boolean>;
  listTagsForAddress(address: string): Promise<string[]>;
  listAddressesForTag(qualifierName: string): Promise<string[]>;
  checkAddressRestriction(address: string, restrictedAssetName: string): Promise<boolean>;
  isAddressFrozen(address: string, restrictedAssetName: string): Promise<boolean>;
  checkGlobalRestriction(restrictedAssetName: string): Promise<boolean>;
  getVerifierString(restrictedAssetName: string): Promise<string>;
  isValidVerifierString(verifierString: string): Promise<boolean>;
  getSnapshotRequest(assetName: string, blockHeight: number): Promise<Record<string, unknown>>;
  cancelSnapshotRequest(assetName: string, blockHeight: number): Promise<boolean>;
  listDepinHolders(assetName: string): Promise<DepinHolderEntry[]>;
  checkDepinValidity(assetName: string, address: string): Promise<DepinValidityResult>;
  assetExists(assetName: string): Promise<boolean>;
  getAssetType(assetName: string): string;
  getAssetCount(): Promise<number>;
}

declare class NeuraiAssets {
  constructor(rpc: (method: string, params?: unknown[]) => Promise<unknown> | unknown, config?: NeuraiAssetsConfig);

  rpc: (method: string, params?: unknown[]) => Promise<unknown> | unknown;
  config: Required<NeuraiAssetsConfig>;
  queries: AssetQueries;

  updateConfig(config: Partial<NeuraiAssetsConfig>): void;

  createRootAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  createSubAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  createDepinAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  reissueAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  createUniqueAssets(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  createQualifier(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  tagAddresses(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  untagAddresses(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  createRestrictedAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  reissueRestrictedAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  freezeAddresses(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  unfreezeAddresses(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  freezeAssetGlobally(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
  unfreezeAssetGlobally(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;

  getAssetData(assetName: string): Promise<Record<string, unknown>>;
  listAssets(filter?: string, verbose?: boolean, count?: number, start?: number): Promise<unknown>;
  listMyAssets(assetName?: string, verbose?: boolean, count?: number, start?: number, confs?: number): Promise<Record<string, unknown>>;
  listAddressesByAsset(assetName: string, onlyCount?: boolean, count?: number, start?: number): Promise<unknown>;
  listAssetBalancesByAddress(address: string, onlyTotal?: boolean, count?: number, start?: number): Promise<unknown>;
  checkAddressTag(address: string, qualifierName: string): Promise<boolean>;
  listTagsForAddress(address: string): Promise<string[]>;
  listAddressesForTag(qualifierName: string): Promise<string[]>;
  checkAddressRestriction(address: string, restrictedAssetName: string): Promise<boolean>;
  isAddressFrozen(address: string, restrictedAssetName: string): Promise<boolean>;
  checkGlobalRestriction(restrictedAssetName: string): Promise<boolean>;
  getVerifierString(restrictedAssetName: string): Promise<string>;
  isValidVerifierString(verifierString: string): Promise<boolean>;
  getSnapshotRequest(assetName: string, blockHeight: number): Promise<Record<string, unknown>>;
  cancelSnapshotRequest(assetName: string, blockHeight: number): Promise<boolean>;
  listDepinHolders(assetName: string): Promise<DepinHolderEntry[]>;
  checkDepinValidity(assetName: string, address: string): Promise<DepinValidityResult>;
  assetExists(assetName: string): Promise<boolean>;
  getAssetType(assetName: string): string;
  getAssetCount(): Promise<number>;

  static NeuraiAssets: typeof NeuraiAssets;
  static AssetQueries: typeof AssetQueries;
  static builders: Record<string, unknown>;
  static constants: Record<string, unknown>;
  static errors: Record<string, unknown>;
  static validators: Record<string, unknown>;
  static utils: Record<string, unknown>;
}

declare const builders: Record<string, unknown>;
declare const constants: Record<string, unknown>;
declare const errors: Record<string, unknown>;
declare const validators: Record<string, unknown>;
declare const utils: Record<string, unknown>;

export default NeuraiAssets;
export {
  AssetQueries,
  NeuraiAssets,
  builders,
  constants,
  errors,
  utils,
  validators
};
