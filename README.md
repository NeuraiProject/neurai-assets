# @neuraiproject/neurai-assets

Complete asset management library for Neurai blockchain. Supports creation, reissuance, and queries for all asset types in a non-custodial way.

## Features

- ✅ **Non-custodial**: Library builds unsigned transactions, your wallet signs them
- ✅ **All asset types**: ROOT, SUB, UNIQUE (NFTs), QUALIFIER, RESTRICTED
- ✅ **Complete operations**: Creation, reissuance, tagging, freezing
- ✅ **RPC queries**: Complete wrapper for all asset query methods
- ✅ **Client-side validation**: Prevents errors before creating transactions
- ✅ **Owner token protection**: Validation to prevent permanent loss

## Supported Asset Types

| Type | Format | Cost | Description |
|------|---------|-------|-------------|
| **ROOT** | `MYTOKEN` | 1000 XNA | Standard token |
| **SUB** | `PARENT/SUB` | 200 XNA | Sub-token of a ROOT |
| **UNIQUE** | `ROOT#TAG` | 10 XNA | Unique NFT |
| **QUALIFIER** | `#KYC` | 2000 XNA | Compliance tag |
| **SUB_QUALIFIER** | `#PARENT/#SUB` | 200 XNA | Sub-qualifier |
| **RESTRICTED** | `$SECURITY` | 3000 XNA | Security token with compliance |

## Installation

```bash
npm install @neuraiproject/neurai-assets
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

## Operation Examples

### Create ROOT Asset

```javascript
const result = await assets.createRootAsset({
  assetName: 'MYTOKEN',
  quantity: 1000000,      // Total supply
  units: 2,                // Decimals (0-8)
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
  quantity: 500000,        // Additional amount to mint
  reissuable: true,        // false = lock supply permanently
  newIpfs: 'Qm...'        // Update IPFS (optional)
});
```

### Create UNIQUE Assets (NFTs)

```javascript
const result = await assets.createUniqueAssets({
  rootAssetName: 'MYTOKEN',
  assetTags: [
    {
      tag: 'NFT001',
      hasIpfs: true,
      ipfsHash: 'QmNFT1...'
    },
    {
      tag: 'NFT002',
      hasIpfs: true,
      ipfsHash: 'QmNFT2...'
    }
  ]
});
```

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

### Detect Asset Type

```javascript
const type = assets.getAssetType('MYTOKEN');        // 'ROOT'
const type2 = assets.getAssetType('PARENT/SUB');    // 'SUB'
const type3 = assets.getAssetType('TOKEN#NFT');     // 'UNIQUE'
const type4 = assets.getAssetType('#KYC');          // 'QUALIFIER'
const type5 = assets.getAssetType('$SECURITY');     // 'RESTRICTED'
const type6 = assets.getAssetType('MYTOKEN!');      // 'OWNER'
```

## Transaction Result Structure

All creation/reissuance operations return an object with this structure:

```javascript
{
  rawTx: 'hex string',           // Unsigned transaction (to sign with wallet)
  inputs: [...],                  // Transaction inputs
  outputs: {...},                 // Ordered outputs
  fee: 0.001,                     // Fee in XNA
  burn: 1000,                     // Burned amount in XNA
  metadata: {                     // Operation-specific metadata
    assetName: 'MYTOKEN',
    ownerTokenName: 'MYTOKEN!',
    operationType: 'ISSUE_ROOT'
  }
}
```

## Owner Tokens - IMPORTANT

When you create an asset, an **owner token** is automatically generated (e.g., `MYTOKEN!`).

⚠️ **CRITICAL**: The owner token is required to:
- Reissue (mint more supply)
- Create SUB assets
- Manage tags (if qualifier)
- Freeze/unfreeze (if restricted)

⚠️ **If you lose the owner token, you lose these capabilities PERMANENTLY**

The library automatically validates that the owner token is returned in each operation to prevent accidental loss.

## Operation Costs

| Operation | Cost (XNA burned) |
|-----------|---------------------|
| Create ROOT asset | 1000 |
| Create SUB asset | 200 |
| Create UNIQUE asset | 10 (per NFT) |
| Create QUALIFIER (root) | 2000 |
| Create QUALIFIER (sub) | 200 |
| Create RESTRICTED asset | 3000 |
| Reissue ROOT/SUB | 200 |
| Reissue RESTRICTED | 200 |
| Tag/Untag address | 0.1 (per address) |
| Freeze/Unfreeze address | 0 (network fee only) |
| Freeze/Unfreeze global | 0 (network fee only) |

**Note**: In addition to the burned cost, all operations pay a network fee (calculated automatically).

## Validations

The library validates client-side:

✅ Asset names (format, length, allowed characters)
✅ Amounts (not exceeding max supply of 21 billion)
✅ Decimals (0-8)
✅ IPFS hashes (valid format)
✅ Verifier strings (boolean logic syntax)
✅ Sufficient funds (XNA and assets)
✅ Required owner tokens
✅ Owner tokens returned (prevents loss)
✅ Address prefixes by network

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
  changeAddress: 'm...' // or 'n...'
  toAddress: 'm...'
});
```

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