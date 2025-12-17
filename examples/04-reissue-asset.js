/**
 * Example: Reissue Assets (Mint More Supply)
 *
 * This example demonstrates how to reissue (mint more) of an existing asset.
 * Reissuing allows you to increase the total supply of a ROOT or SUB asset.
 *
 * Requirements:
 * - Must own the asset's owner token (ASSET!)
 * - Asset must be reissuable (reissuable flag must be true)
 *
 * Cost: 200 XNA (burned)
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function reissueAsset() {
  // Mock RPC function (replace with your actual RPC client)
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Your RPC implementation here
  };

  // Initialize NeuraiAssets
  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    // Step 1: Check current asset data
    const assetName = 'MYTOKEN';
    const assetData = await assets.getAssetData(assetName);

    console.log('Current Asset Info:');
    console.log('- Name:', assetData.name);
    console.log('- Current Supply:', assetData.amount);
    console.log('- Units:', assetData.units);
    console.log('- Reissuable:', assetData.reissuable);

    // Step 2: Verify asset is reissuable
    if (!assetData.reissuable) {
      throw new Error('Asset supply is locked and cannot be reissued');
    }

    // Step 3: Verify you own the owner token
    const ownerToken = `${assetName}!`;
    const myAssets = await assets.listMyAssets(ownerToken);

    if (!myAssets[ownerToken]) {
      throw new Error(`You must own ${ownerToken} to reissue this asset`);
    }

    console.log(`✓ Owner token found: ${ownerToken}`);

    // Step 4: Reissue (mint more supply)
    const result = await assets.reissueAsset({
      assetName: assetName,
      quantity: 500000,           // Additional amount to mint
      reissuable: true,            // Keep it reissuable (false to lock forever)
      newIpfs: ''                  // Optional: update IPFS metadata
    });

    const newTotalSupply = assetData.amount + 500000;

    console.log('\nReissue transaction created successfully!');
    console.log('Raw Transaction:', result.rawTx);
    console.log('Fee:', result.fee, 'XNA');
    console.log('Burn:', result.burn, 'XNA');
    console.log('Amount to Mint:', result.metadata.quantityMinted);
    console.log('Previous Supply:', result.metadata.previousSupply);
    console.log('New Total Supply:', result.metadata.newTotalSupply);

    console.log('\nNext steps:');
    console.log('1. Sign the transaction');
    console.log('2. Broadcast to network');
    console.log('3. New tokens will be added to your balance');

  } catch (error) {
    console.error('Error reissuing asset:', error.message);

    if (error.name === 'AssetNotReissuableError') {
      console.error('This asset supply is locked and cannot be reissued');
    } else if (error.name === 'OwnerTokenNotFoundError') {
      console.error('You do not own the required owner token');
    } else if (error.name === 'MaxSupplyExceededError') {
      console.error('Reissuing would exceed maximum supply of 21 billion');
    }
  }
}

// Example: Lock the supply forever
async function lockSupply() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    // Reissue with reissuable=false to lock supply forever
    const result = await assets.reissueAsset({
      assetName: 'MYTOKEN',
      quantity: 0,                 // No additional supply
      reissuable: false,           // LOCK SUPPLY FOREVER
      newIpfs: ''
    });

    console.log('Supply locked permanently!');
    console.log('No more tokens can ever be minted for this asset');
    console.log('Reissuable Status:', result.metadata.reissuableLocked ? 'LOCKED' : 'UNLOCKED');

    // WARNING: This action is PERMANENT and cannot be undone!

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Update IPFS metadata
async function updateMetadata() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    // Reissue to update IPFS hash without minting new supply
    const result = await assets.reissueAsset({
      assetName: 'MYTOKEN',
      quantity: 0,                              // No new supply
      reissuable: true,                         // Keep reissuable
      newIpfs: 'QmNewUpdatedMetadata...'       // New IPFS hash
    });

    console.log('Metadata updated successfully!');
    console.log('New IPFS hash:', 'QmNewUpdatedMetadata...');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the examples
console.log('=== Example 1: Mint More Supply ===\n');
reissueAsset();

console.log('\n\n=== Example 2: Lock Supply Forever ===\n');
lockSupply();

console.log('\n\n=== Example 3: Update Metadata ===\n');
updateMetadata();
