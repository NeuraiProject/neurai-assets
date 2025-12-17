/**
 * Example: Create UNIQUE Assets (NFTs)
 *
 * This example demonstrates how to create UNIQUE assets (NFTs).
 * UNIQUE assets are one-of-a-kind tokens with the format: ROOT#TAG
 *
 * Requirements:
 * - Must own the parent ROOT asset's owner token (ROOT!)
 *
 * Cost: 10 XNA per NFT (burned)
 * Format: ROOT#TAG (e.g., MYTOKEN#001, MYTOKEN#GENESIS)
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function createNFTs() {
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
    // Verify you own the ROOT asset's owner token
    const rootOwnerToken = 'MYTOKEN!';
    const myAssets = await assets.listMyAssets(rootOwnerToken);

    if (!myAssets[rootOwnerToken]) {
      throw new Error(`You must own ${rootOwnerToken} to create UNIQUE assets`);
    }

    console.log(`✓ Owner token found: ${rootOwnerToken}`);

    // Create multiple NFTs in a single transaction
    const result = await assets.createUniqueAssets({
      rootAssetName: 'MYTOKEN',
      assetTags: [
        {
          tag: 'GENESIS',                    // First NFT: MYTOKEN#GENESIS
          hasIpfs: true,
          ipfsHash: 'QmNFT1GenesisMetadata...'
        },
        {
          tag: '001',                        // Second NFT: MYTOKEN#001
          hasIpfs: true,
          ipfsHash: 'QmNFT2Metadata...'
        },
        {
          tag: '002',                        // Third NFT: MYTOKEN#002
          hasIpfs: true,
          ipfsHash: 'QmNFT3Metadata...'
        },
        {
          tag: 'SPECIAL_EDITION',            // Fourth NFT: MYTOKEN#SPECIAL_EDITION
          hasIpfs: true,
          ipfsHash: 'QmNFT4Metadata...'
        }
      ]
    });

    console.log('NFT Collection created successfully!');
    console.log('Raw Transaction:', result.rawTx);
    console.log('Total Fee:', result.fee, 'XNA');
    console.log('Total Burn:', result.burn, 'XNA (10 XNA per NFT)');
    console.log('NFTs Created:', result.metadata.assetTags.length);
    console.log('Owner Token Used:', result.metadata.ownerTokenUsed);

    console.log('\nNFTs created:');
    result.metadata.assetTags.forEach((tag, index) => {
      console.log(`${index + 1}. MYTOKEN#${tag}`);
    });

    // IMPORTANT: Each UNIQUE asset has a quantity of 1 and cannot be reissued
    // Each NFT is truly unique and one-of-a-kind

    console.log('\nNFT Properties:');
    console.log('- Quantity: 1 (fixed, cannot be changed)');
    console.log('- Reissuable: No (unique forever)');
    console.log('- Units: 0 (not divisible)');
    console.log('- IPFS: Each NFT can have its own metadata');

  } catch (error) {
    console.error('Error creating NFTs:', error.message);

    if (error.name === 'OwnerTokenNotFoundError') {
      console.error('You do not own the required ROOT owner token');
    } else if (error.name === 'InvalidAssetNameError') {
      console.error('Invalid NFT tag format');
    }
  }
}

// Alternative: Create a single NFT
async function createSingleNFT() {
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
    // Create just one NFT
    const result = await assets.createUniqueAssets({
      rootAssetName: 'MYTOKEN',
      assetTags: [
        {
          tag: 'LEGENDARY',
          hasIpfs: true,
          ipfsHash: 'QmLegendaryNFTMetadata...'
        }
      ]
    });

    console.log('Single NFT created: MYTOKEN#LEGENDARY');
    console.log('Burn:', result.burn, 'XNA');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the examples
console.log('=== Example 1: Create NFT Collection ===\n');
createNFTs();

console.log('\n\n=== Example 2: Create Single NFT ===\n');
createSingleNFT();
