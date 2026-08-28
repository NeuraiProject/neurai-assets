# @neuraiproject/neurai-assets

Complete asset management library for Neurai blockchain. Supports creation, reissuance, and queries for all asset types in a non-custodial way.

> **1.6.0**: full DEPIN support — sub-DEPIN issuance (which needs the
> **immediate** parent's owner token), holder freeze/unfreeze through the same
> `freezeAddresses`/`unfreezeAddresses` calls, `selfRevokeDepin` and
> `listDepinAddresses`. Also a fix beyond DEPIN: the parent of `A/B/C` resolved
> to `A` instead of `A/B`, so every third-level issuance — sub-asset,
> sub-qualifier or sub-DEPIN — was rejected by the node.
>
> **1.5.3**: fee estimation stopped modelling the payload encoding and started
> measuring it. Twelve of eighteen operations were budgeting below the node's
> minimum, which forced a rebuild-and-re-sign on every one of them (see
> *Fee estimation*).
>
> **1.5.2**: same RPC calls, fewer round trips. The UTXO and mempool reads run
> together, and the fee rate and NIP-040 marker start alongside the first read
> instead of queuing behind it — 6 calls in 3 round trips instead of 6, which
> against a remote proxy halves the time to build anything.
>
> **1.5.1**: fix — `Buffer` reached the browser bundle through the fee sizing
> helper and broke any asset build in an extension.
>
> **1.5.0**: `createTransactionBuild` canonical contract; decimal strings for
> amounts; exact-satoshi funding loop; reissue built locally so assets with
> `units > 0` can be reissued at all.
>
> **1.4.1**: fix — the constructor dropped `config.assetMarker`, so the
> wallet-level override documented in 1.4.0 never reached the builders
> (per-operation `params.assetMarker` was unaffected). Precedence is now
> effective: `params.assetMarker` > `config.assetMarker` > node.
>
> **1.4.0**: NIP-040 `assetMarker` in `localRawBuild` (see below); RPC
> rejection messages from `@neuraiproject/neurai-rpc` >= 0.5 are surfaced
> correctly (they carry no `.message`); name-length caps now mirror the node
> (full name, owner `!` included: 31 mainnet / 121 testnet-regtest, validated
> against a regtest node); peer `neurai-rpc ^0.6.0`.

## Features

- ✅ **Non-custodial**: Library builds unsigned transactions, your wallet signs them
- ✅ **All asset types**: ROOT, SUB, UNIQUE (NFTs), QUALIFIER, RESTRICTED, DEPIN
- ✅ **Complete operations**: Creation, reissuance, tagging, freezing
- ✅ **DEPIN management**: sub-assets, holder freeze/unfreeze, self-revocation, validity queries
- ✅ **RPC queries**: Complete wrapper for all asset query methods
- ✅ **Client-side validation**: Prevents errors before creating transactions
- ✅ **Owner token protection**: Validation to prevent permanent loss
- ✅ **Legacy + AuthScript destinations**: Supports classic `N...` / `t...` and witness-v1 `nq1...` / `tnq1...` addresses

## Supported Asset Types

| Type | Format | Cost | Description |
|------|---------|-------|-------------|
| **ROOT** | `MYTOKEN` | 1000 XNA | Standard token |
| **SUB** | `PARENT/SUB` | 200 XNA | Sub-token of a ROOT |
| **UNIQUE** | `ROOT#TAG` | 10 XNA | Unique NFT |
| **QUALIFIER** | `#KYC` | 2000 XNA | Compliance tag |
| **SUB_QUALIFIER** | `#PARENT/#SUB` | 200 XNA | Sub-qualifier |
| **RESTRICTED** | `$SECURITY` | 3000 XNA | Security token with compliance |
| **DEPIN** | `&DEVICE` | 10 XNA | Soulbound asset with holder validity controls |
| **SUB DEPIN** | `&DEVICE/ROUTER001` | 10 XNA | Same burn as a root DEPIN, but requires the **immediate parent's** owner token |

## Quantities and asset units

Every `quantity` / `asset_quantity` parameter accepted by this library is a
**user-facing display amount** — the same number a human would write to mean
"this many tokens". For an asset with `units = 2`, `quantity: 10.50` means
ten and a half tokens; for an asset with `units = 0`, `quantity: 1` means
one whole token.

Internally the daemon parses the JSON `asset_quantity` field with
`AmountFromValue` ([Bitcoin-style decimal → 10⁸ sats][amount-from-value])
and validates that the resulting CAmount is a multiple of `10^(8 − units)`
via `CheckAmountWithUnits`. Because the chain already does the ×10⁸ scaling
itself, **the library must NOT pre-multiply** the value. Sending the raw
display number is the only correct behavior; any extra factor on the wire
either silently inflates the minted supply (`× 10⁸ → 100,000,000` tokens
where the user asked for 1) or trips the daemon's
`ParseFixedPoint` cap with `Invalid amount (3): …`.

This was regressed in `1.2.2`/`1.3.x` (a hardcoded `× 10⁸` was added to
`BaseAssetTransactionBuilder.toSatoshis`) and fixed in the version after
`1.3.1`. If you write a custom builder, follow the same convention: pass
the user amount through unchanged, let the daemon scale.

[amount-from-value]: https://github.com/NeuraiProject/Neurai-DePIN/blob/main/src/rpc/server.cpp

## Installation

```bash
npm install @neuraiproject/neurai-assets
```

## Package Outputs

The package now publishes explicit entry points for each runtime:

- `@neuraiproject/neurai-assets`: main ESM/CJS library entry
- `@neuraiproject/neurai-assets/browser`: browser-focused ESM entry
- `@neuraiproject/neurai-assets/global`: IIFE bundle for `<script src>`

### ESM

```javascript
import NeuraiAssets from '@neuraiproject/neurai-assets';
```

### Browser ESM

```javascript
import NeuraiAssets from '@neuraiproject/neurai-assets/browser';
```

### Classic HTML

```html
<script src="./node_modules/@neuraiproject/neurai-assets/dist/NeuraiAssets.global.js"></script>
<script>
  const assets = new globalThis.NeuraiAssets(rpc, {
    network: 'xna'
  });
</script>
```

## Basic Usage

```javascript
const NeuraiAssets = require('@neuraiproject/neurai-assets');

// Initialize with RPC function
const assets = new NeuraiAssets(rpc, {
  network: 'xna',
  addresses: walletAddresses,
  changeAddress: myChangeAddress,
  toAddress: myReceivingAddress
});

// Create a ROOT asset
const result = await assets.createRootAsset({
  assetName: 'MYTOKEN',
  quantity: 1000000,
  units: 2,
  reissuable: true
});

// Sign and broadcast
const signedTx = await wallet.signTransaction(result.rawTx);
const txid = await wallet.broadcastTransaction(signedTx);
```

You can also initialize the library with AuthScript addresses:

```javascript
const assetsPQ = new NeuraiAssets(rpc, {
  network: 'xna',                    // 'xna-pq' / 'xna-pq-test' remain valid aliases
  addresses: ['nq1yourauthscriptaddress...'],
  changeAddress: 'nq1yourauthscriptchange...',
  toAddress: 'nq1recipientauthscriptaddress...'
});
```

## Operation Examples

### Create ROOT Asset

```javascript
const result = await assets.createRootAsset({
  assetName: 'MYTOKEN',
  quantity: 1000000,      // Total supply, in display units (1,000,000 tokens)
  units: 2,                // Decimal precision (0–8). With units=2, fractional
                           // values down to 0.01 are allowed.
  reissuable: true,        // Allow reissuance
  hasIpfs: true,
  ipfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
});
```

### Create SUB Asset

```javascript
// Requires the parent asset's owner token (MYTOKEN!)
const result = await assets.createSubAsset({
  assetName: 'MYTOKEN/SUB',
  quantity: 100000,
  units: 0,
  reissuable: true
});
```

### Reissue (Mint more supply)

```javascript
// Requires the asset's owner token (MYTOKEN!)
const result = await assets.reissueAsset({
  assetName: 'MYTOKEN',
  quantity: 500000,        // Additional amount to mint, in display units.
                           // For an asset with units=0, `quantity: 1`
                           // mints exactly 1 token (NOT 100,000,000).
  reissuable: true,        // false = lock supply permanently
  newIpfs: 'Qm...'         // Update IPFS (optional)
});
```

> **Note**: `units` cannot be passed to `reissueAsset` — the chain inherits
> the asset's existing precision (use `new_units` in the raw output if you
> ever need to change it, but this library doesn't expose that today).

### Create DEPIN Asset

```javascript
const result = await assets.createDepinAsset({
  assetName: '&DEVICE/ROUTER001',
  quantity: 1,
  reissuable: false,
  hasIpfs: false
});
```

> **Note**: DEPIN assets always use `units = 0`. Recipient and change destinations
> can be either legacy or AuthScript, as long as they belong to the same chain family.

A **sub-DEPIN** (`&DEVICE/ROUTER001`) costs the same as a root DEPIN, but the
node requires the transaction to spend and return the **immediate parent's**
owner token — `&DEVICE!` here, and `&DEVICE/ROUTER001!` for a third level. The
library finds it, adds it as an input and returns it automatically; without it
the node rejects the transaction with
`Trying to create outpoint for asset that you don't have`.

So `&A/B/C` needs `&A/B!`, **not** `&A!`. Before 1.6.0 the library resolved the
parent as the root and every third-level issuance was rejected.

### Transfer Asset

```javascript
// Works for any asset type (regular, sub, restricted, DePIN).
const result = await assets.transferAsset({
  assetName: 'MYTOKEN',
  recipients: [
    { address: 'nM...', amount: 5 },   // amount in display units
    { address: 'nQ...', amount: 2.5 }
  ]
  // changeAddress is optional; defaults to the configured change address.
  // Asset change and the network fee are handled automatically.
});
```

> **DePIN (`&`) note**: DePIN assets are soulbound — the transfer is only valid
> if it is authorized by the owner. `transferAsset` handles this automatically:
> it spends the asset's owner token (`&NAME!`) and returns it to the change
> address, so authority stays with the sender. You must hold the owner token, or
> the call throws `OwnerTokenNotFoundError`. Transferring ownership itself (handing
> the owner token to the recipient) is not done here.

### Create UNIQUE Assets (NFTs)

```javascript
// Without IPFS metadata
const result = await assets.createUniqueAssets({
  rootName: 'MYTOKEN',
  assetTags: ['NFT001', 'NFT002', 'NFT003']
});

// With IPFS metadata (ipfsHashes must be same length as assetTags)
const result = await assets.createUniqueAssets({
  rootName: 'MYTOKEN',
  assetTags: ['NFT001', 'NFT002'],
  ipfsHashes: ['QmNFT1...', 'QmNFT2...']
});
```

> **Note**: UNIQUE asset properties (`units`, `reissuable`) are always `0` and are
> set automatically by the node — they cannot be configured per asset.

### Create QUALIFIER (KYC Tags)

```javascript
const result = await assets.createQualifier({
  qualifierName: '#KYC_VERIFIED',
  quantity: 1,
  hasIpfs: true,
  ipfsHash: 'Qm...'
});
```

### Tag Addresses

```javascript
// Requires the qualifier's owner token (#KYC_VERIFIED!)
const result = await assets.tagAddresses({
  qualifierName: '#KYC_VERIFIED',
  addresses: [
    'NAddress1...',
    'NAddress2...'
  ],
  assetData: 'KYC expires 2025-12-31'
});
```

### Untag Addresses

```javascript
const result = await assets.untagAddresses({
  qualifierName: '#KYC_VERIFIED',
  addresses: ['NAddress1...']
});
```

### Create RESTRICTED Asset (Security Token)

```javascript
const result = await assets.createRestrictedAsset({
  assetName: '$SECURITY',
  quantity: 1000000,
  units: 2,
  verifierString: '#KYC_VERIFIED & #ACCREDITED',  // Boolean logic
  reissuable: true,
  hasIpfs: true,
  ipfsHash: 'Qm...'
});
```

### Reissue RESTRICTED Asset

```javascript
const result = await assets.reissueRestrictedAsset({
  assetName: '$SECURITY',
  quantity: 500000,
  changeVerifier: true,
  newVerifier: '(#KYC_VERIFIED & #ACCREDITED) | #INSTITUTIONAL',
  reissuable: false  // Lock supply
});
```

### Freeze Addresses

```javascript
// Requires the asset's owner token ($SECURITY! or &DEVICE!)
const result = await assets.freezeAddresses({
  assetName: '$SECURITY',
  addresses: ['NAddress1...', 'NAddress2...']
});

// Since 1.6.0, the same call freezes a DEPIN holder
await assets.freezeAddresses({
  assetName: '&DEVICE',
  addresses: ['NDevice1...']
});
```

Both asset kinds share this operation because the node builds them identically:
an owner-token escort plus one null-asset-data output carrying `(name, flag)`.
A frozen DEPIN holder keeps the asset but `checkDepinValidity` reports
`valid: 0`.

Two rules the library enforces before the node does:

- the address holding the owner token **cannot** be frozen or revoked — if it
  were, nobody could undo it;
- **global** freeze does not apply to DEPIN assets; manage them holder by
  holder.

### Unfreeze Addresses

```javascript
const result = await assets.unfreezeAddresses({
  assetName: '$SECURITY',
  addresses: ['NAddress1...']
});
```

This is also how an owner undoes a holder's self-revocation.

### Freeze Asset Globally

```javascript
const result = await assets.freezeAssetGlobally({
  assetName: '$SECURITY'
});
```

> Restricted assets only. Calling it on a DEPIN asset throws: the node has no
> global restriction for them.

### Self-Revoke a DEPIN Asset (1.6.0+)

```javascript
// Run from the wallet that HOLDS the device asset — no owner token needed.
const result = await assets.selfRevokeDepin({ assetName: '&DEVICE' });
```

A holder renouncing its own asset. The proof of ownership is spending its own
asset UTXO, which returns to the same address together with the revocation
mark, so the operation needs no owner token and no burn.

⚠️ Only the asset owner can undo it, with `unfreezeAddresses`. If the revoking
address also held the owner token nobody could, so the library refuses that
case — move the owner token elsewhere first.

### Unfreeze Asset Globally

```javascript
const result = await assets.unfreezeAssetGlobally({
  assetName: '$SECURITY'
});
```

## Queries

### Get Asset Metadata

```javascript
const assetData = await assets.getAssetData('MYTOKEN');
console.log(assetData);
// {
//   name: 'MYTOKEN',
//   amount: 1000000,
//   units: 2,
//   reissuable: true,
//   has_ipfs: true,
//   ipfs_hash: 'Qm...'
// }
```

### List All Assets

```javascript
const allAssets = await assets.listAssets('*', false, 100, 0);
// Returns array of asset names

// With details
const detailed = await assets.listAssets('MY*', true, 100, 0);
// Returns object with complete metadata
```

### List My Assets

```javascript
const myAssets = await assets.listMyAssets();
console.log(myAssets);
// {
//   'MYTOKEN': 1000.00,
//   'ANOTHER': 500.50
// }
```

### View Asset Holders

```javascript
const holders = await assets.listAddressesByAsset('MYTOKEN');
console.log(holders);
// [
//   { address: 'NAddress1...', amount: 500.00 },
//   { address: 'NAddress2...', amount: 300.00 }
// ]

// Count only
const count = await assets.listAddressesByAsset('MYTOKEN', true);
console.log(count); // 2
```

### View Address Assets

```javascript
const balances = await assets.listAssetBalancesByAddress('NAddress1...');
console.log(balances);
// [
//   { asset: 'MYTOKEN', amount: 500.00 },
//   { asset: 'ANOTHER', amount: 100.00 }
// ]
```

### Check Address Tags

```javascript
// Check if address has a specific tag
const hasTag = await assets.checkAddressTag('NAddress1...', '#KYC_VERIFIED');
console.log(hasTag); // true/false

// List all tags for an address
const tags = await assets.listTagsForAddress('NAddress1...');
console.log(tags); // ['#KYC_VERIFIED', '#ACCREDITED']
```

### Check Restrictions

```javascript
// Check if address can receive restricted asset
const canReceive = await assets.checkAddressRestriction('NAddress1...', '$SECURITY');
console.log(canReceive); // true/false

// Check if address is frozen
const isFrozen = await assets.isAddressFrozen('NAddress1...', '$SECURITY');
console.log(isFrozen); // true/false

// Check if asset is globally frozen
const isGloballyFrozen = await assets.checkGlobalRestriction('$SECURITY');
console.log(isGloballyFrozen); // true/false
```

### View Verifier String

```javascript
const verifier = await assets.getVerifierString('$SECURITY');
console.log(verifier); // '#KYC_VERIFIED & #ACCREDITED'

// Validate verifier syntax
const isValid = await assets.isValidVerifierString('(#KYC | #AML) & #ACCREDITED');
console.log(isValid); // true/false
```

### Check if Asset Exists

```javascript
const exists = await assets.assetExists('MYTOKEN');
console.log(exists); // true/false
```

### View DEPIN Holders

```javascript
const holders = await assets.listDepinHolders('&DEVICE/ROUTER001');
console.log(holders);
// [
//   { address: 'nq1holder...', amount: 1, valid: 1 },
//   { address: 'nq1holder2...', amount: 1, valid: 0 }
// ]
```

### Check DEPIN Validity for an Address

```javascript
const validity = await assets.checkDepinValidity('&DEVICE/ROUTER001', 'nq1holder...');
console.log(validity);
// {
//   has_asset: true,
//   amount: 1,
//   valid: 1,
//   blocked: false
// }
```

### List DEPIN Addresses With a Revealed Public Key (1.6.0+)

```javascript
const addresses = await assets.listDepinAddresses('&DEVICE');
console.log(addresses);
// [ { address: 'tAhTaUnh...', pubkey: '03d0813ea333...' } ]
```

The subset of holders that can take part in DEPIN messaging, which needs the
public key. It is **not** a replacement for `listDepinHolders`: it says nothing
about validity or amounts, and a holder that has never spent does not appear.

Requires the node running with `-pubkeyindex` (and a reindex). Without it the
error says so instead of hiding behind a generic failure.

### Detect Asset Type

```javascript
const type = assets.getAssetType('MYTOKEN');        // 'ROOT'
const type2 = assets.getAssetType('PARENT/SUB');    // 'SUB'
const type3 = assets.getAssetType('TOKEN#NFT');     // 'UNIQUE'
const type4 = assets.getAssetType('#KYC');          // 'QUALIFIER'
const type5 = assets.getAssetType('$SECURITY');     // 'RESTRICTED'
const type6 = assets.getAssetType('&DEVICE/ONE');   // 'DEPIN'
const type7 = assets.getAssetType('MYTOKEN!');      // 'OWNER'
```

## Transaction Result Structure

All creation/reissuance operations return an object with this structure:

```javascript
{
  rawTx: 'hex string',           // Unsigned transaction built by the node (to sign with wallet)
  utxos: [...],                  // UTXOs selected for the operation
  inputs: [...],                  // Transaction inputs
  outputs: [...],                 // Ordered outputs (DISPLAY amounts, for createrawtransaction)
  fee: 0.001,                     // Fee in XNA
  burnAmount: 1000,               // Burned amount in XNA
  assetName: 'MYTOKEN',           // Operation-specific fields vary by builder
  ownerTokenName: 'MYTOKEN!',
  operationType: 'ISSUE_ROOT',
  createTransactionBuild: { ... } // Build it yourself, offline — see below
}
```

## Building offline with `createTransactionBuild` (1.5.0+)

`rawTx` above is built by the node through `createrawtransaction`. To build the
same transaction **locally**, pass `result.createTransactionBuild` straight to
`@neuraiproject/neurai-create-transaction`:

```javascript
import { createFromOperation } from '@neuraiproject/neurai-create-transaction';

const result = await assets.transferAsset({
  assetName: 'MYTOKEN',
  recipients: [{ address: 'tRecipient...', amount: 4.35 }]
});

const built = createFromOperation(result.createTransactionBuild);
// built.rawTx — sign it with @neuraiproject/neurai-sign-transaction
```

Nothing has to be renamed, rescaled or reinterpreted in between. In particular
you do **not** need to:

- map the operation type — a transfer already arrives as `STANDARD_TRANSFER` or
  `TRANSFER_DEPIN`, the discriminants the serializer accepts;
- merge recipients, asset change and the DePIN owner return into one list (the
  serializer emits the `&NAME!` escort itself; listing it again would produce
  two owner outputs);
- convert display amounts to protocol integers;
- add or correct `assetMarker`.

### Display amounts vs raw amounts

The library speaks two representations, deliberately kept apart:

| Where | Representation | Why |
| --- | --- | --- |
| Your call (`quantity`, `recipients[].amount`) | Display (`4.35`) | What a user types |
| `result.outputs` (RPC envelope) | Display (`4.35`) | `createrawtransaction` scales it itself |
| `result.createTransactionBuild` (`*Raw`, `*Sats`) | `bigint` (`435000000n`) | What the chain encodes |

The asset payload scale is always `10^8`, **independently of the asset's
`units`**: `units` limits divisibility and presentation, it is never a
multiplier. A quantity of `1.25` reaches the chain as `125000000n` whether the
asset has `units=2` or `units=8`.

Conversion goes through text rather than `Math.round(value * 1e8)`. That
multiplication is fine for ordinary magnitudes — `4.35 * 1e8` is
`434999999.99999994`, but `Math.round` recovers `435000000` — and it fails
silently in exactly two places:

- **more than eight decimals** are rounded away instead of rejected, so an
  amount can vanish (`1e-9` → `0`) or shift (`1.123456789` → `112345679`);
- **past `Number.MAX_SAFE_INTEGER`** the scaled product drops bits:
  `184467440.73709551` → `18446744073709552`, one unit off.

Both are reachable with values a wallet can hold. Here, an amount is rejected
rather than silently truncated when it has more than eight decimals, when the
asset's `units` cannot represent it, or when it exceeds the consensus ceiling
`MAX_MONEY` (`21000000000` units — the node's `MoneyRange`).

### Large amounts: pass a string

Above `MAX_SAFE_INTEGER / 1e8` (~`90071992.55`) a JavaScript `number` can no
longer name every 8-decimal value, so a **fractional** one is refused there and
the error names the string to use instead:

```javascript
await assets.createRootAsset({ assetName: 'BIG', quantity: 100000000.5, units: 1 });
// InvalidAmountError: ... pass it as a decimal string ("100000000.5") instead.

await assets.createRootAsset({ assetName: 'BIG', quantity: '100000000.5', units: 1 });
// works
```

A **safe integer** is still accepted however large it scales, so the documented
maximum supply `21000000000` keeps working as a number. Strings are exempt from
this precision guard — they carried their own digits — but not from any other
rule: sign, decimals, `units` divisibility and `MAX_MONEY` apply equally.

### Migration 1.4.x → 1.5.x → 2.0

| | 1.4.x | 1.5.x | 2.0 |
| --- | --- | --- | --- |
| `localRawBuild` | only option | present, **deprecated** | removed |
| `createTransactionBuild` | — | present, canonical | only option |
| Transfers via `createFromOperation` | rejected (`TRANSFER` is not a discriminant) | work | work |
| `*Raw` fields | display values | protocol integers | protocol integers |
| `toSatoshis(amount, units)` | returns the display amount | unchanged, deprecated | removed |

`localRawBuild` keeps its exact 1.4.x shape through the whole 1.x line, so no
consumer has to move on this release. New integrations should read
`createTransactionBuild` only.

**1.6.0** adds DEPIN management and fixes two things that were silently broken.
No API changed shape:

| | Before 1.6.0 | 1.6.0 |
| --- | --- | --- |
| Parent of `A/B/C` | `A` — every third-level issuance was rejected | `A/B`, as the node resolves it |
| Create `&A/B` | rejected: the parent's owner token was never spent | works |
| `freezeAddresses` / `unfreezeAddresses` | restricted assets only | also DEPIN (`&NAME`) |
| Self-revoke, `listDepinAddresses` | — | new |

### Serializer version

The canonical contract needs `@neuraiproject/neurai-create-transaction`
**>= 0.8.0**. Two of its fixes are load-bearing here:

- global `FREEZE_ASSET` / `UNFREEZE_ASSET` encode the restriction flag as
  `1`/`0` (0.7.0 emitted `3`/`2`, which the node rejected with
  `bad-txns-null-data-flag-must-be-0-or-1`, so those two discriminants could
  not reach a mempool);
- a reissue that omits `units` encodes "keep the current units" (`0xff`), which
  is what this library relies on — see below.

### Reissue never changes an asset's units

There is no API here to change the precision of an existing asset, so a reissue
build deliberately **omits** `units`, which the serializer encodes as `0xff`
("keep"). Echoing the value read from `getassetdata` would instead say "set
units to N", and a stale read — the asset reissued to a higher precision
between the read and the broadcast — would ask the node to lower them, which it
rejects with `unit must be larger than current unit selection`.

The value read from the chain is still used, to check that the requested
`quantity` fits the asset's precision.

### Reissue is built locally

Some operations cannot be expressed through the node's `createrawtransaction`,
even though the node accepts the resulting transaction perfectly well. Those
build their `rawTx` with `createFromOperation` instead and report
`buildStrategy: 'local-builder'`; everything else still reports `'rpc-node'`.

| Operation | Why the RPC cannot express it | Since |
| --- | --- | --- |
| `reissueAsset`, `reissueRestrictedAsset` | the `reissue` object has no units field, so the node assumes `0` and refuses any asset with units above zero (`unit must be larger than current unit selection`) | 1.5.0 |
| `freezeAddresses` / `unfreezeAddresses` on a **DEPIN** asset | `freeze_addresses` demands a restricted name: `a valid restricted asset name must be provided` | 1.6.0 |
| `selfRevokeDepin` | no equivalent RPC object | 1.6.0 |

Restricted-asset freezing keeps the RPC path unchanged.

This is why `@neuraiproject/neurai-create-transaction` is a runtime
**dependency**, not just a dev one.

One consequence to know about: on the local path `result.outputs` and `rawTx`
describe the same operation but not the same output list. The node
auto-generates the owner-token return while processing a reissue entry, so the
RPC envelope omits it, while the locally built transaction carries it
explicitly — three entries in `outputs` against four vouts in `rawTx`. Both are
valid; parse `rawTx` when you need the outputs the chain will see, and do not
index `outputs` against its vouts.

## Owner Tokens - IMPORTANT

When you create an asset, an **owner token** is automatically generated (e.g., `MYTOKEN!`).

⚠️ **CRITICAL**: The owner token is required to:
- Reissue (mint more supply)
- Create SUB assets — the **immediate** parent's token: `A/B/C` needs `A/B!`
- Create sub-DEPIN assets — likewise, `&A/B` needs `&A!`
- Manage tags (if qualifier)
- Freeze/unfreeze holders (restricted **and** DEPIN)

A holder can always self-revoke its own DEPIN asset without any owner token
(`selfRevokeDepin`), but only the owner can undo that.

⚠️ **If you lose the owner token, you lose these capabilities PERMANENTLY**

The library automatically validates that the owner token is returned in each operation to prevent accidental loss.

> **UNIQUE assets exception**: When issuing UNIQUE assets (`ROOT#TAG`), the Neurai node
> returns the owner token automatically as part of processing the `issue_unique` operation.
> The library does not add a manual return output for this case — doing so would duplicate
> the owner token in the outputs and cause the transaction to fail with "Assets would be burnt".

## Operation Costs

| Operation | Cost (XNA burned) |
|-----------|---------------------|
| Create ROOT asset | 1000 |
| Create SUB asset | 200 |
| Create UNIQUE asset | 10 (per NFT) |
| Create QUALIFIER (root) | 2000 |
| Create QUALIFIER (sub) | 200 |
| Create RESTRICTED asset | 3000 |
| Create DEPIN asset (root or sub) | 10 |
| Reissue ROOT/SUB | 200 |
| Reissue DEPIN | 200 |
| Reissue RESTRICTED | 200 |
| Tag/Untag address | 0 (network fee only; spends 1 unit of the qualifier per address) |
| Freeze/Unfreeze address | 0 (network fee only) |
| Freeze/Unfreeze global | 0 (network fee only) |
| Self-revoke DEPIN | 0 (network fee only) |

**Note**: In addition to the burned cost, all operations pay a network fee (calculated automatically).

## NIP-040 asset marker (local raw builds)

Asset payloads open with a 3-byte marker that NIP-040 migrates from the
Ravencoin-inherited `rvn` to `xna` at an activation height per network
(testnet: 303000, already crossed; regtest: 1; mainnet: not scheduled yet).

- Transactions built **through the node** (`createrawtransaction`) need
  nothing: the node stamps the marker itself.
- Locally built transactions carry `params.assetMarker` in both
  `createTransactionBuild` and the deprecated `localRawBuild`. Builders
  resolve it **once per build**:
  1. `params.assetMarker` / `config.assetMarker` if you set it (`'rvn'` |
     `'xna'` — offline builds or tests);
  2. otherwise the node's `getblockchaininfo.asset_marker` (node commit
     `347362b` or later);
  3. `'rvn'` when the node predates that field — which matches what such a
     node enforces.

No height tables and no network inference: the node (or you) decides.

### Failure policy (`assetMarkerPolicy`, 1.5.0+)

Step 3 above covers a node that *answers* without the field. A node that does
not answer at all is a different situation, and `assetMarkerPolicy` decides it:

```javascript
const assets = new NeuraiAssets(rpc, {
  network: 'xna-test',
  addresses: [...],
  assetMarkerPolicy: 'strict'   // default: 'legacy-fallback'
});
```

| Policy | `getblockchaininfo` fails | Field absent/null | Unknown value |
| --- | --- | --- | --- |
| `legacy-fallback` (default in 1.x) | resolves `'rvn'` | resolves `'rvn'` | throws |
| `strict` | **throws** | resolves `'rvn'` | throws |

Use `strict` in a connected wallet on a post-NIP-040 chain: guessing `'rvn'`
there builds a transaction the node rejects with
`bad-txns-legacy-asset-marker-after-nip040`, so "the node did not answer" must
not silently become "the node said rvn". The rejection propagates out of the
build — you never receive a partial result — and the node is queried only once,
whether the query succeeds or fails.

## Validations

The library validates client-side:

✅ Asset names (format, length, allowed characters)
✅ Amounts (not exceeding max supply of 21 billion display tokens)
✅ Decimals (0-8)
✅ IPFS hashes (valid format)
✅ Verifier strings (boolean logic syntax)
✅ Sufficient funds (XNA and assets)
✅ Required owner tokens
✅ Owner tokens returned (prevents loss)
✅ Address prefixes by network

The daemon also enforces server-side that quantities respect the asset's
precision (`CheckAmountWithUnits` — see [Quantities and asset units](#quantities-and-asset-units)),
so e.g. trying to issue `0.1` of a `units=0` asset is rejected with
`min-qty-not-multiple-of-units` regardless of what the client sent.

## Network Configuration

```javascript
// Mainnet
const assets = new NeuraiAssets(rpc, {
  network: 'xna',
  addresses: [...],
  changeAddress: 'N...',
  toAddress: 'N...'
});

// Testnet
const assets = new NeuraiAssets(rpc, {
  network: 'xna-test',
  addresses: [...],
  changeAddress: 't...',
  toAddress: 't...'
});

// AuthScript mainnet using the canonical network label
const assetsPQ = new NeuraiAssets(rpc, {
  network: 'xna',
  addresses: ['nq1...'],
  changeAddress: 'nq1...',
  toAddress: 'nq1...'
});

// AuthScript testnet using the canonical network label
const assetsPQTest = new NeuraiAssets(rpc, {
  network: 'xna-test',
  addresses: ['tnq1...'],
  changeAddress: 'tnq1...',
  toAddress: 'tnq1...'
});
```

The library accepts these network names:

- `xna`: mainnet chain family, valid for both legacy `N...` and AuthScript `nq1...`
- `xna-test`: testnet chain family, valid for both legacy `t...` and AuthScript `tnq1...`
- `xna-pq`: compatibility alias for AuthScript mainnet flows
- `xna-pq-test`: compatibility alias for AuthScript testnet flows

If you need to derive AuthScript addresses, use `neurai-key` and pass the resulting
`nq1...` or `tnq1...` addresses into this library.

## Update Configuration

```javascript
assets.updateConfig({
  addresses: newAddresses,
  changeAddress: newChangeAddress
});
```

## Advanced API

For advanced usage, you can use builders directly:

```javascript
const { builders } = require('@neuraiproject/neurai-assets');

const builder = new builders.IssueRootBuilder(rpc, {
  assetName: 'MYTOKEN',
  quantity: 1000000,
  units: 2,
  network: 'xna',
  addresses: [...],
  changeAddress: '...',
  toAddress: '...'
});

const result = await builder.build();
```

The builders module exports:

- `DepinSelfRevokeBuilder`
- `FreezeAddressBuilder`
- `IssueDepinBuilder`
- `IssueQualifierBuilder`
- `IssueRestrictedBuilder`
- `IssueRootBuilder`
- `IssueSubBuilder`
- `IssueUniqueBuilder`
- `ReissueBuilder`
- `ReissueRestrictedBuilder`
- `TagAddressBuilder`
- `TransferBuilder`

## Error Handling

The library throws specific errors:

```javascript
const { errors } = require('@neuraiproject/neurai-assets');

try {
  await assets.createRootAsset({...});
} catch (error) {
  if (error instanceof errors.AssetExistsError) {
    console.error('Asset already exists');
  } else if (error instanceof errors.InsufficientFundsError) {
    console.error('Insufficient funds');
  } else if (error instanceof errors.OwnerTokenNotFoundError) {
    console.error('You do not have the required owner token');
  } else if (error instanceof errors.OwnerTokenNotReturnedError) {
    console.error('CRITICAL: Owner token not returned');
  }
}
```

Available errors:
- `AssetError` - Base error
- `AssetNotFoundError`
- `AssetExistsError`
- `AssetNotReissuableError`
- `InvalidAssetNameError`
- `InvalidAddressError`
- `InsufficientFundsError`
- `InsufficientAssetBalanceError`
- `OwnerTokenNotFoundError`
- `OwnerTokenNotReturnedError` (CRITICAL)
- `MaxSupplyExceededError`
- `InvalidIpfsHashError`
- `InvalidVerifierStringError`

## Wallet Integration

```javascript
const NeuraiWallet = require('@neuraiproject/neurai-jswallet');
const NeuraiAssets = require('@neuraiproject/neurai-assets');

// Initialize wallet
const wallet = new NeuraiWallet(mnemonic, {
  network: 'xna',
  rpcUrl: 'http://localhost:9766',
  rpcUser: 'user',
  rpcPassword: 'pass'
});

// Initialize assets with wallet RPC
const assets = new NeuraiAssets(
  wallet.rpc.bind(wallet),
  {
    network: 'xna',
    addresses: wallet.getAllAddresses(),
    changeAddress: wallet.getChangeAddress(),
    toAddress: wallet.getReceivingAddress()
  }
);

// Create asset
const result = await assets.createRootAsset({
  assetName: 'MYTOKEN',
  quantity: 1000000,
  units: 2
});

// Sign with wallet
const signedTx = await wallet.signTransaction(result.rawTx);

// Broadcast
const txid = await wallet.broadcastTransaction(signedTx);
console.log('Transaction ID:', txid);
```

For AuthScript wallets, derive addresses externally with `neurai-key`, then initialize
`NeuraiAssets` with those `nq1...` / `tnq1...` addresses. The recommended network labels
are `xna` and `xna-test`; `xna-pq` and `xna-pq-test` remain available as compatibility aliases.

## Fee estimation (PQ-aware)

Asset transactions are usually built with one or two XNA inputs plus, depending on the operation, an owner-token or qualifier UTXO. Since `1.5.0` the XNA side is funded by a loop that selects inputs, recomputes the fee from the *real* (PQ-aware) descriptors of the full input set, and repeats until the funds cover burn + fee. Every round excludes the outpoints it already holds, so a transaction never spends the same outpoint twice and the fee always accounts for every input it pays for.

Running out of funds raises `InsufficientFundsError` rather than returning an underfunded build. That includes a case worth knowing about: each PQ input costs about `0.0147 XNA` in fee, so a UTXO worth less than that makes the shortfall *worse*, and a wallet fragmented into such pieces cannot fund a PQ transaction at all.

All estimates share a single `estimatesmartfee` lookup. The fee rate is stable for the lifetime of one build, so it is fetched on the first estimate and cached on the builder instance.

Estimates use the helpers in [`src/utils/feeSizing.js`](src/utils/feeSizing.js) and distinguish PQ AuthScript inputs/outputs from legacy P2PKH ones. PQ inputs spend ~977 vbytes vs ~148 for legacy — without this distinction, transactions built from PQ addresses fall under the node's `min relay fee` and are rejected with `code -26: min relay fee not met`.

Outputs that carry an asset payload are sized as such, not as bare P2PKH outputs. An asset output is `<destination> OP_XNA_ASSET <pushdata payload> OP_DROP`, which adds roughly 20-60 bytes; ignoring that under-counts a transaction by a few percent, and that is enough to fall below the floor whenever the node's fee rate sits close to its minimum relay fee.

Since `1.5.3` those sizes are **not modelled, they are measured**: `feeSizing` asks `@neuraiproject/neurai-create-transaction` to encode the very script the output will carry and takes its length. The hand-written formula it replaced had drifted in two ways — the owner token an operation *returns* is serialized as a transfer (it carries an amount), not with the `owner` payload that an issuance *creates*, and the null-asset-data outputs of tag/freeze were not counted at all, since their script **replaces** the destination instead of extending it. Twelve of eighteen operations were budgeting below what the node charges. The regtest e2e now asserts, for every operation, that the budgeted fee reaches the node's minimum for the signed vsize.

You should not need to call these helpers directly; they are wired into every builder. They are documented here so you can audit the fee math or use the same constants if you compose transactions outside the standard builder flow.

```js
const {
  VBYTES,
  estimateInputVbytes,
  estimateOutputBytes,
  estimateTransactionVbytes,
  isPQAddress,
  isPQScript,
} = require('@neuraiproject/neurai-assets/src/utils/feeSizing');

VBYTES.legacyInputVbytes; // 148
VBYTES.pqInputVbytes;     // 977
VBYTES.legacyOutputBytes; // 34
VBYTES.pqOutputBytes;     // 43

estimateInputVbytes({ script: '5120…' });        // 977
estimateInputVbytes({ address: 'nq1…' });        // 977
estimateInputVbytes({ address: 'mgRYHdMq…' });   // 148
estimateOutputBytes('tnq1…');                    // 43

// Asset outputs declare their payload. Sizes come from the real encoder, so
// they match the bytes the node will see.
estimateOutputBytes({ address: 't7pv…', assetName: 'ROOTX' });                   // 55  transfer (default)
estimateOutputBytes({ address: 't7pv…', assetName: 'ROOTX', kind: 'issue' });    // 58
estimateOutputBytes({ address: 't7pv…', assetName: 'ROOTX', kind: 'reissue' });  // 57

// 'owner' describes the token an ISSUANCE CREATES — it carries no amount.
estimateOutputBytes({ address: 't7pv…', assetName: 'ROOTX!', kind: 'owner' });   // 48
// The token an operation SPENDS AND RETURNS is a transfer, 8 bytes wider.
estimateOutputBytes({ address: 't7pv…', assetName: 'ROOTX!' });                  // 56

// Null-asset-data kinds have no destination: their script replaces it, so
// nothing is added on top.
estimateOutputBytes({ address: 't7pv…', assetName: '#KYC', kind: 'tag' });          // 38
estimateOutputBytes({ address: 't7pv…', assetName: '$SEC', kind: 'restriction' });  // 38
estimateOutputBytes({ assetName: '$SEC', kind: 'globalRestriction' });             // 19
estimateOutputBytes({ kind: 'verifier', verifierString: '#KYC' });                 // 17

const vbytes = estimateTransactionVbytes(
  [{ script: '5120…' }, { address: 'mgRYHdMq…' }],   // 1 PQ + 1 legacy input
  ['nq1qchange…', 'mgRYHdMqburn…'],                  // 1 PQ + 1 legacy output
);
```

The constants mirror those exported from `@neuraiproject/neurai-sign-transaction` (`VBYTES`). They are inlined here on purpose: depending on the full signer would pull `bitcoinjs-lib` and `@noble/post-quantum` into the IIFE / browser bundles, far more weight than these constants need. The signer remains the source of truth — if it ever bumps a vbytes value, this file must follow.

`feeSizing` does depend on `neurai-create-transaction` for the payload sizes above, which is already a runtime dependency and is bundled anyway. If an encoder cannot express a descriptor — an address family it does not accept — the estimate falls back to the previous formula rather than throwing in the middle of a fee calculation.

### Limitations

The estimator assumes the most common spend layout for every input:

- legacy inputs → P2PKH `scriptSig` worst case (DER signature + compressed pubkey)
- PQ inputs → AuthScript v1 with the **default** `OP_TRUE` `witnessScript` and **no** `functionalArgs`

That covers all standard asset operations. If you build transactions whose PQ inputs use covenant `witnessScript`s, NoAuth (`authType=0x00`) or Legacy AuthScript (`authType=0x02`) witnesses, compute the witness size yourself and add it to the result of `estimateTransactionVbytes` (or use `estimateVirtualSize` from `@neuraiproject/neurai-sign-transaction` after building the raw transaction, which fills dummy witnesses of the worst-case size and returns the exact post-signing vsize).
