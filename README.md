# @neuraiproject/neurai-assets

Complete asset management library for Neurai blockchain. Supports creation, reissuance, and queries for all asset types in a non-custodial way.

## Features

- ✅ **Non-custodial**: Library builds unsigned transactions, your wallet signs them
- ✅ **All asset types**: ROOT, SUB, UNIQUE (NFTs), QUALIFIER, RESTRICTED, DEPIN
- ✅ **Complete operations**: Creation, reissuance, tagging, freezing
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
| **DEPIN** | `&DEVICE` or `&DEVICE/ROUTER001` | 10 XNA | Soulbound asset with holder validity controls |

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
// Requires the restricted asset's owner token ($SECURITY!)
const result = await assets.freezeAddresses({
  assetName: '$SECURITY',
  addresses: ['NAddress1...', 'NAddress2...']
});
```

### Unfreeze Addresses

```javascript
const result = await assets.unfreezeAddresses({
  assetName: '$SECURITY',
  addresses: ['NAddress1...']
});
```

### Freeze Asset Globally

```javascript
const result = await assets.freezeAssetGlobally({
  assetName: '$SECURITY'
});
```

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
  rawTx: 'hex string',           // Unsigned transaction (to sign with wallet)
  utxos: [...],                  // UTXOs selected for the operation
  inputs: [...],                  // Transaction inputs
  outputs: [...],                 // Ordered outputs
  fee: 0.001,                     // Fee in XNA
  burnAmount: 1000,               // Burned amount in XNA
  assetName: 'MYTOKEN',           // Operation-specific fields vary by builder
  ownerTokenName: 'MYTOKEN!',
  operationType: 'ISSUE_ROOT'
}
```

## Owner Tokens - IMPORTANT

When you create an asset, an **owner token** is automatically generated (e.g., `MYTOKEN!`).

⚠️ **CRITICAL**: The owner token is required to:
- Reissue (mint more supply)
- Create SUB assets
- Manage tags (if qualifier)
- Freeze/unfreeze (if restricted)
- Manage DEPIN reissuance and controls (if depin)

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
| Create DEPIN asset | 10 |
| Reissue ROOT/SUB | 200 |
| Reissue DEPIN | 200 |
| Reissue RESTRICTED | 200 |
| Tag/Untag address | 0 (network fee only; spends 1 unit of the qualifier per address) |
| Freeze/Unfreeze address | 0 (network fee only) |
| Freeze/Unfreeze global | 0 (network fee only) |

**Note**: In addition to the burned cost, all operations pay a network fee (calculated automatically).

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

The builders module also includes:

- `IssueDepinBuilder`
- `IssueRootBuilder`
- `IssueSubBuilder`
- `IssueUniqueBuilder`
- `IssueQualifierBuilder`
- `IssueRestrictedBuilder`
- `ReissueBuilder`
- `ReissueRestrictedBuilder`

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

Asset transactions are usually built with one or two XNA inputs plus, depending on the operation, an owner-token or qualifier UTXO. The library estimates the fee twice per build: a rough pre-estimate to size the initial XNA selection, and a final estimate once the actual UTXOs are known.

Both estimates share a single `estimatesmartfee` lookup. The fee rate is stable for the lifetime of one build, so it is fetched on the first `estimateFee` call and cached on the builder instance for the second — half as many RPC round trips as before `1.3.1`.

Both estimates use the helpers in [`src/utils/feeSizing.js`](src/utils/feeSizing.js) and distinguish PQ AuthScript inputs/outputs from legacy P2PKH ones. PQ inputs spend ~977 vbytes vs ~148 for legacy — without this distinction, transactions built from PQ addresses fall under the node's `min relay fee` and are rejected with `code -26: min relay fee not met`.

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

const vbytes = estimateTransactionVbytes(
  [{ script: '5120…' }, { address: 'mgRYHdMq…' }],   // 1 PQ + 1 legacy input
  ['nq1qchange…', 'mgRYHdMqburn…'],                  // 1 PQ + 1 legacy output
);
```

The constants mirror those exported from `@neuraiproject/neurai-sign-transaction` (`VBYTES`). They are inlined here on purpose: depending on the full signer would pull `bitcoinjs-lib` and `@noble/post-quantum` into the IIFE / browser bundles, far more weight than these constants need. The signer remains the source of truth — if it ever bumps a vbytes value, this file must follow.

### Limitations

The estimator assumes the most common spend layout for every input:

- legacy inputs → P2PKH `scriptSig` worst case (DER signature + compressed pubkey)
- PQ inputs → AuthScript v1 with the **default** `OP_TRUE` `witnessScript` and **no** `functionalArgs`

That covers all standard asset operations. If you build transactions whose PQ inputs use covenant `witnessScript`s, NoAuth (`authType=0x00`) or Legacy AuthScript (`authType=0x02`) witnesses, compute the witness size yourself and add it to the result of `estimateTransactionVbytes` (or use `estimateVirtualSize` from `@neuraiproject/neurai-sign-transaction` after building the raw transaction, which fills dummy witnesses of the worst-case size and returns the exact post-signing vsize).
