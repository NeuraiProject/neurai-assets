/**
 * Compile-time gate: every value this library declares as
 * `createTransactionBuild` must be assignable to the parameter type
 * `createFromOperation` declares.
 *
 * The runtime matrix in tests/unit/builders/createTransactionBuildCompatibility.test.js
 * proves the actual values work. This file proves the TYPES cannot drift apart
 * without someone noticing at compile time — the two packages hold the contract
 * independently, so nothing else keeps them aligned.
 *
 * Checked with `npm run test:types` (tsc --noEmit). It emits nothing.
 */

import type { CreateTransactionFromOperationParams } from '@neuraiproject/neurai-create-transaction';
import type {
  CreateTransactionBuild,
  CreateTransactionOperationType,
  NeuraiAssetsBuildResult
} from '../../index';

/** Our canonical build is accepted wherever the serializer's own type is. */
type AssertAssignable<T extends CreateTransactionFromOperationParams> = T;
type _OurBuildIsAccepted = AssertAssignable<CreateTransactionBuild>;

/** Every discriminant we expose is one the serializer knows. */
type SerializerOperationType = CreateTransactionFromOperationParams['operationType'];
type AssertKnownDiscriminant<T extends SerializerOperationType> = T;
type _OurDiscriminantsAreKnown = AssertKnownDiscriminant<CreateTransactionOperationType>;

/** The plan's out-of-scope list: these must NOT appear in our surface. */
type OutOfScope = 'STANDARD_PAYMENT' | 'ISSUE_MSGCHANNEL' | 'SELF_REVOKE_DEPIN';
type _NoneOutOfScopeExposed = Extract<CreateTransactionOperationType, OutOfScope> extends never
  ? true
  : ['unexpected discriminant exposed', Extract<CreateTransactionOperationType, OutOfScope>];
const _outOfScopeIsEmpty: _NoneOutOfScopeExposed = true;

/** A build result flows straight into the serializer with no adaptation. */
declare const result: NeuraiAssetsBuildResult;
declare function createFromOperation(build: CreateTransactionFromOperationParams): { rawTx: string };
const _built = createFromOperation(result.createTransactionBuild);

/** Narrowing by operationType yields the right params, not an open record. */
const build: CreateTransactionBuild = result.createTransactionBuild;
if (build.operationType === 'STANDARD_TRANSFER') {
  const first: bigint | undefined = build.params.transfers[0]?.amountRaw;
  void first;
  // @ts-expect-error STANDARD_TRANSFER carries no XNA envelope; change is a payment.
  void build.params.xnaChangeSats;
}
if (build.operationType === 'TRANSFER_DEPIN') {
  const owner: string = build.params.ownerChangeAddress;
  const network: 'xna' | 'xna-test' = build.params.network;
  void owner;
  void network;
}
if (build.operationType === 'ISSUE_ROOT') {
  const quantity: bigint = build.params.quantityRaw;
  void quantity;
  // @ts-expect-error quantityRaw is a protocol integer, never a display number.
  const asNumber: number = build.params.quantityRaw;
  void asNumber;
}

export type { _OurBuildIsAccepted, _OurDiscriminantsAreKnown };
export { _outOfScopeIsEmpty, _built };
