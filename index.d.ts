/**
 * NIP-040 asset payload marker. The chain decides which one new asset
 * outputs must carry; the node reports it as
 * `getblockchaininfo.asset_marker`. Omit to let the builders ask the node
 * (falls back to 'rvn' on nodes that do not report the field).
 */
export type AssetMarker = 'rvn' | 'xna';

/**
 * What to do when `getblockchaininfo` FAILS while resolving the marker.
 *
 * - `legacy-fallback` (default in 1.x): resolve `'rvn'`, as 1.4.x did.
 * - `strict`: propagate the error. On a post-NIP-040 chain a guessed `'rvn'`
 *   builds a transaction the node rejects, so "the node did not answer" must
 *   not become "the node said rvn".
 *
 * A node that simply predates the field resolves `'rvn'` under both policies:
 * that is an answer, not a failure.
 */
export type AssetMarkerPolicy = 'strict' | 'legacy-fallback';

export interface NeuraiAssetsConfig {
  network?: string;
  addresses?: string[];
  changeAddress?: string | null;
  toAddress?: string | null;
  assetMarker?: AssetMarker;
  assetMarkerPolicy?: AssetMarkerPolicy;
}

/**
 * @deprecated Since 1.5.0. Use {@link NeuraiAssetsBuildResult.createTransactionBuild},
 * which is the exact shape `createFromOperation` accepts. Removed in 2.0.0.
 */
export type LegacyOperationType =
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

/** @deprecated Alias kept for 1.x consumers. Use {@link LegacyOperationType}. */
export type OperationType = LegacyOperationType;

/**
 * How `rawTx` was produced. `'rpc-node'`: the node's `createrawtransaction`.
 * `'local-builder'`: built locally with `createFromOperation` — used by the
 * reissue operations since 1.5.0, because the RPC's reissue objects cannot
 * express "keep the current units" and reject any asset with units > 0.
 */
export type BuildStrategy = 'rpc-node' | 'local-builder';

export interface BuildInput {
  txid: string;
  vout: number;
  address: string;
  satoshis: number;
  assetName?: string;
}

/**
 * @deprecated Since 1.5.0. Its `*Raw` fields carry DISPLAY amounts, its
 * `TRANSFER` discriminant is not one `createFromOperation` accepts, and its
 * `params` is an open record with no narrowing. Kept unchanged through 1.x for
 * existing consumers; removed in 2.0.0. Use `createTransactionBuild`.
 */
export interface LocalRawBuild {
  operationType: LegacyOperationType | 'TRANSFER';
  /** Includes `assetMarker` (NIP-040) for createFromOperation >= 0.7.0. */
  params: Record<string, unknown> & { assetMarker?: AssetMarker };
}

/** The canonical network labels the serializer understands. */
export type CanonicalNetwork = 'xna' | 'xna-test';

/** Outpoint reference, exactly as create-transaction consumes it. */
export interface CanonicalInput {
  txid: string;
  vout: number;
}

/** An XNA payment output. */
export interface CanonicalPayment {
  address: string;
  valueSats: bigint;
}

/** One asset transfer output. `amountRaw` is 10^8-scaled, never a display value. */
export interface CanonicalTransfer {
  address: string;
  assetName: string;
  amountRaw: bigint;
  assetMarker?: AssetMarker;
}

/** Fields every canonical build carries. */
export interface CanonicalParamsBase {
  inputs: CanonicalInput[];
  assetMarker: AssetMarker;
}

/** The XNA envelope shared by the operations that burn and/or return change. */
export interface CanonicalXnaEnvelope {
  burnAddress?: string;
  burnAmountSats?: bigint;
  xnaChangeAddress?: string;
  xnaChangeSats?: bigint;
}

export interface CanonicalIssueParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  assetName: string;
  quantityRaw: bigint;
  units?: number;
  reissuable?: boolean;
  ipfsHash?: string;
  ownerTokenAddress?: string;
}

export interface CanonicalIssueSubParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  assetName: string;
  quantityRaw: bigint;
  units?: number;
  reissuable?: boolean;
  ipfsHash?: string;
  parentOwnerAddress?: string;
}

export interface CanonicalIssueDepinParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  assetName: string;
  quantityRaw: bigint;
  ipfsHash?: string;
  ownerTokenAddress?: string;
  reissuable?: boolean;
  /** Canonical label, so the serializer's mainnet DePIN guard actually runs. */
  network: CanonicalNetwork;
}

export interface CanonicalIssueUniqueParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  rootName: string;
  assetTags: string[];
  ipfsHashes?: Array<string | undefined>;
  ownerTokenAddress?: string;
}

export interface CanonicalIssueQualifierParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  assetName: string;
  quantityRaw: bigint;
  ipfsHash?: string;
  rootChangeAddress?: string;
  changeQuantityRaw?: bigint;
}

export interface CanonicalIssueRestrictedParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  assetName: string;
  quantityRaw: bigint;
  verifierString: string;
  units?: number;
  reissuable?: boolean;
  ipfsHash?: string;
  ownerChangeAddress?: string;
}

export interface CanonicalReissueParams extends CanonicalParamsBase, CanonicalXnaEnvelope {
  toAddress: string;
  assetName: string;
  quantityRaw: bigint;
  /**
   * Always omitted by this library: it has no API to change an asset's units,
   * so its builds mean "keep the current ones", which the serializer encodes
   * as `0xff`. Present in the type because create-transaction accepts it.
   */
  units?: number;
  reissuable?: boolean;
  ipfsHash?: string;
  ownerChangeAddress?: string;
  verifierString?: string;
}

export interface CanonicalTagParams extends CanonicalParamsBase {
  qualifierName: string;
  targetAddresses: string[];
  burnAddress: string;
  burnAmountSats: bigint;
  xnaChangeAddress: string;
  xnaChangeSats: bigint;
  qualifierChangeAddress: string;
  qualifierChangeAmountRaw: bigint;
}

export interface CanonicalFreezeAddressesParams extends CanonicalParamsBase {
  assetName: string;
  targetAddresses: string[];
  ownerChangeAddress: string;
  xnaChangeAddress?: string;
  xnaChangeSats?: bigint;
}

export interface CanonicalFreezeAssetParams extends CanonicalParamsBase {
  assetName: string;
  ownerChangeAddress: string;
  xnaChangeAddress?: string;
  xnaChangeSats?: bigint;
}

export interface CanonicalStandardTransferParams extends CanonicalParamsBase {
  payments: CanonicalPayment[];
  transfers: CanonicalTransfer[];
}

export interface CanonicalDepinTransferParams extends CanonicalParamsBase {
  transfers: CanonicalTransfer[];
  /** Destination of the escorting `&X!` output, which the serializer emits itself. */
  ownerChangeAddress: string;
  xnaChangeAddress?: string;
  xnaChangeSats?: bigint;
  network: CanonicalNetwork;
}

/**
 * The exact value `createFromOperation` accepts, with no adaptation:
 *
 * ```ts
 * const result = await assets.transferAsset({ ... });
 * const built = createFromOperation(result.createTransactionBuild);
 * ```
 *
 * Discriminated on `operationType`, closed (no index signature), and every
 * amount is a protocol integer.
 */
export type CreateTransactionBuild =
  | { operationType: 'ISSUE_ROOT'; params: CanonicalIssueParams }
  | { operationType: 'ISSUE_SUB'; params: CanonicalIssueSubParams }
  | { operationType: 'ISSUE_DEPIN'; params: CanonicalIssueDepinParams }
  | { operationType: 'ISSUE_UNIQUE'; params: CanonicalIssueUniqueParams }
  | { operationType: 'ISSUE_QUALIFIER' | 'ISSUE_SUB_QUALIFIER'; params: CanonicalIssueQualifierParams }
  | { operationType: 'ISSUE_RESTRICTED'; params: CanonicalIssueRestrictedParams }
  | { operationType: 'REISSUE' | 'REISSUE_RESTRICTED'; params: CanonicalReissueParams }
  | { operationType: 'TAG_ADDRESSES' | 'UNTAG_ADDRESSES'; params: CanonicalTagParams }
  | { operationType: 'FREEZE_ADDRESSES' | 'UNFREEZE_ADDRESSES'; params: CanonicalFreezeAddressesParams }
  | { operationType: 'FREEZE_ASSET' | 'UNFREEZE_ASSET'; params: CanonicalFreezeAssetParams }
  | { operationType: 'STANDARD_TRANSFER'; params: CanonicalStandardTransferParams }
  | { operationType: 'TRANSFER_DEPIN'; params: CanonicalDepinTransferParams };

/** The discriminants this library exposes canonically. */
export type CreateTransactionOperationType = CreateTransactionBuild['operationType'];

export interface NeuraiAssetsBuildResult {
  rawTx: string;
  fee: number;
  burnAmount: number;
  network: string;
  buildStrategy: BuildStrategy;
  burnAddress: string | null;
  changeAddress: string | null;
  changeAmount: number | null;
  operationType?: LegacyOperationType | 'TRANSFER';
  /**
   * Ready for `createFromOperation(...)` as-is. Always present on a successful
   * build; narrow it with `operationType`.
   */
  createTransactionBuild: CreateTransactionBuild;
  /** @deprecated Since 1.5.0; removed in 2.0.0. See {@link LocalRawBuild}. */
  localRawBuild?: LocalRawBuild;
  inputs: BuildInput[];
  /**
   * The `createrawtransaction` output envelope, in display amounts.
   *
   * Do NOT index these against `rawTx`'s vouts. They match on the `'rpc-node'`
   * path, but not on `'local-builder'` (the reissue operations since 1.5.0):
   * the node auto-generates the owner-token return while processing a reissue
   * entry, so this envelope omits it, whereas the locally built `rawTx`
   * carries it explicitly — three entries here against four vouts there.
   * Both are valid; they are simply two descriptions of the same operation.
   * Parse `rawTx` when you need the outputs the chain will see.
   */
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
  transferAsset(params: Record<string, unknown>): Promise<NeuraiAssetsBuildResult>;
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
