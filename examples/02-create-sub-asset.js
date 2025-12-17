/**
 * Example: Create a SUB Asset
 *
 * This example demonstrates how to create a SUB asset.
 * SUB assets are child assets of a ROOT asset (format: ROOT/SUB).
 *
 * Requirements:
 * - Must own the parent ROOT asset's owner token (PARENT!)
 *
 * Cost: 200 XNA (burned)
 * Creates: PARENT/SUB + PARENT/SUB! (owner token)
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function createSubAsset() {
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
    // First, verify you own the parent's owner token
    const parentOwnerToken = 'MYTOKEN!';
    const myAssets = await assets.listMyAssets(parentOwnerToken);

    if (!myAssets[parentOwnerToken]) {
      throw new Error(`You must own ${parentOwnerToken} to create a SUB asset`);
    }

    console.log(`✓ Owner token found: ${parentOwnerToken}`);

    // Create a SUB asset
    const result = await assets.createSubAsset({
      assetName: 'MYTOKEN/PREMIUM',  // Format: PARENT/SUB
      quantity: 100000,               // Total supply of SUB asset
      units: 0,                       // Decimals (0-8)
      reissuable: true,               // Allow reissuance
      hasIpfs: false,                 // No IPFS metadata in this example
      ipfsHash: ''
    });

    console.log('SUB Asset transaction created successfully!');
    console.log('Raw Transaction:', result.rawTx);
    console.log('Fee:', result.fee, 'XNA');
    console.log('Burn:', result.burn, 'XNA');
    console.log('Owner Token Used:', result.metadata.ownerTokenUsed);
    console.log('New Owner Token:', result.metadata.ownerTokenName);

    // IMPORTANT: The parent's owner token (MYTOKEN!) is returned in the transaction
    // and must not be lost. The library validates this automatically.

    console.log('\nNext steps:');
    console.log('1. Sign the transaction with your wallet');
    console.log('2. Broadcast to the network');
    console.log('3. You will receive MYTOKEN/PREMIUM and MYTOKEN/PREMIUM!');

  } catch (error) {
    console.error('Error creating SUB asset:', error.message);

    if (error.name === 'OwnerTokenNotFoundError') {
      console.error('You do not own the required owner token');
    } else if (error.name === 'InvalidAssetNameError') {
      console.error('Invalid SUB asset name format (must be PARENT/SUB)');
    }
  }
}

// Run the example
createSubAsset();
