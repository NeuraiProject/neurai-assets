/**
 * Example: Complete Wallet Integration
 *
 * This example demonstrates complete integration with neurai-jswallet.
 * Shows the full workflow from initialization to transaction broadcasting.
 *
 * This is the recommended way to use neurai-assets in production.
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');
// const NeuraiWallet = require('@neuraiproject/neurai-jswallet'); // Uncomment in production

async function completeWalletIntegration() {
  try {
    console.log('=== Complete Wallet Integration Example ===\n');

    // Step 1: Initialize wallet
    console.log('Step 1: Initialize Wallet\n');

    /*
    // Uncomment in production:
    const wallet = new NeuraiWallet(mnemonic, {
      network: 'xna',
      rpcUrl: 'http://localhost:9766',
      rpcUser: 'your-rpc-user',
      rpcPassword: 'your-rpc-password'
    });

    // Wait for wallet to sync
    await wallet.sync();
    console.log('✓ Wallet synced');
    */

    // Mock wallet for example
    const wallet = {
      rpc: async (method, params) => {
        console.log(`  RPC: ${method}`, params);
        return null;
      },
      getAllAddresses: () => ['NAddress1...', 'NAddress2...'],
      getChangeAddress: () => 'NChangeAddress...',
      getReceivingAddress: () => 'NReceivingAddress...',
      signTransaction: async (rawTx) => {
        console.log('  Signing transaction...');
        return 'signed-tx-hex';
      },
      broadcastTransaction: async (signedTx) => {
        console.log('  Broadcasting transaction...');
        return 'transaction-id-hash';
      }
    };

    // Step 2: Initialize NeuraiAssets with wallet
    console.log('\nStep 2: Initialize NeuraiAssets\n');

    const assets = new NeuraiAssets(
      wallet.rpc.bind(wallet),  // Bind wallet's RPC function
      {
        network: 'xna',
        addresses: wallet.getAllAddresses(),
        changeAddress: wallet.getChangeAddress(),
        toAddress: wallet.getReceivingAddress()
      }
    );

    console.log('✓ NeuraiAssets initialized');
    console.log('  Network:', 'xna');
    console.log('  Addresses:', wallet.getAllAddresses().length);

    // Step 3: Create an asset
    console.log('\nStep 3: Create ROOT Asset\n');

    const createResult = await assets.createRootAsset({
      assetName: 'MYTOKEN',
      quantity: 1000000,
      units: 2,
      reissuable: true,
      hasIpfs: true,
      ipfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
    });

    console.log('✓ Transaction built');
    console.log('  Fee:', createResult.fee, 'XNA');
    console.log('  Burn:', createResult.burn, 'XNA');
    console.log('  Owner Token:', createResult.metadata.ownerTokenName);

    // Step 4: Sign the transaction
    console.log('\nStep 4: Sign Transaction\n');

    const signedTx = await wallet.signTransaction(createResult.rawTx);
    console.log('✓ Transaction signed');

    // Step 5: Broadcast the transaction
    console.log('\nStep 5: Broadcast Transaction\n');

    const txid = await wallet.broadcastTransaction(signedTx);
    console.log('✓ Transaction broadcast');
    console.log('  TXID:', txid);

    // Step 6: Wait for confirmation (in production)
    console.log('\nStep 6: Wait for Confirmation\n');
    console.log('  Waiting for blockchain confirmation...');
    console.log('  (In production, poll the transaction status)');

    /*
    // Uncomment in production:
    let confirmed = false;
    while (!confirmed) {
      const tx = await wallet.getTransaction(txid);
      if (tx.confirmations >= 1) {
        confirmed = true;
        console.log('✓ Transaction confirmed!');
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    */

    console.log('\n✓ Asset created successfully!');
    console.log('  You now own: MYTOKEN and MYTOKEN!');

  } catch (error) {
    console.error('Error:', error.message);

    // Handle specific errors
    if (error.name === 'InsufficientFundsError') {
      console.error('Not enough XNA in wallet');
      console.error('Required:', error.required, 'XNA');
      console.error('Available:', error.available, 'XNA');
    } else if (error.name === 'AssetExistsError') {
      console.error('Asset name already taken');
    }
  }
}

// Example: Create multiple assets in sequence
async function createMultipleAssets() {
  const wallet = {
    rpc: async (method, params) => {
      console.log(`  RPC: ${method}`);
      return null;
    },
    getAllAddresses: () => ['NAddress1...'],
    getChangeAddress: () => 'NChangeAddress...',
    getReceivingAddress: () => 'NReceivingAddress...',
    signTransaction: async (rawTx) => 'signed-tx',
    broadcastTransaction: async (signedTx) => `txid-${Date.now()}`
  };

  const assets = new NeuraiAssets(wallet.rpc.bind(wallet), {
    network: 'xna',
    addresses: wallet.getAllAddresses(),
    changeAddress: wallet.getChangeAddress(),
    toAddress: wallet.getReceivingAddress()
  });

  try {
    console.log('=== Create Multiple Assets ===\n');

    // 1. Create ROOT asset
    console.log('1. Creating ROOT asset: MYTOKEN');
    const rootResult = await assets.createRootAsset({
      assetName: 'MYTOKEN',
      quantity: 1000000,
      units: 2,
      reissuable: true
    });

    const rootTxid = await wallet.broadcastTransaction(
      await wallet.signTransaction(rootResult.rawTx)
    );
    console.log('   ✓ TXID:', rootTxid);

    // 2. Create SUB asset
    console.log('\n2. Creating SUB asset: MYTOKEN/PREMIUM');
    const subResult = await assets.createSubAsset({
      assetName: 'MYTOKEN/PREMIUM',
      quantity: 100000,
      units: 0,
      reissuable: true
    });

    const subTxid = await wallet.broadcastTransaction(
      await wallet.signTransaction(subResult.rawTx)
    );
    console.log('   ✓ TXID:', subTxid);

    // 3. Create NFTs
    console.log('\n3. Creating NFTs: MYTOKEN#GENESIS, MYTOKEN#001');
    const nftResult = await assets.createUniqueAssets({
      rootAssetName: 'MYTOKEN',
      assetTags: [
        { tag: 'GENESIS', hasIpfs: true, ipfsHash: 'QmGenesis...' },
        { tag: '001', hasIpfs: true, ipfsHash: 'QmNFT001...' }
      ]
    });

    const nftTxid = await wallet.broadcastTransaction(
      await wallet.signTransaction(nftResult.rawTx)
    );
    console.log('   ✓ TXID:', nftTxid);

    console.log('\n✓ All assets created successfully!');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Error handling
async function errorHandlingExample() {
  const wallet = {
    rpc: async (method, params) => {
      if (method === 'listunspent') {
        // Simulate insufficient funds
        return [];
      }
      return null;
    },
    getAllAddresses: () => ['NAddress1...'],
    getChangeAddress: () => 'NChangeAddress...',
    getReceivingAddress: () => 'NReceivingAddress...'
  };

  const assets = new NeuraiAssets(wallet.rpc.bind(wallet), {
    network: 'xna',
    addresses: wallet.getAllAddresses(),
    changeAddress: wallet.getChangeAddress(),
    toAddress: wallet.getReceivingAddress()
  });

  try {
    console.log('=== Error Handling Example ===\n');

    const result = await assets.createRootAsset({
      assetName: 'MYTOKEN',
      quantity: 1000000,
      units: 2,
      reissuable: true
    });

  } catch (error) {
    console.log('Caught error:', error.name);
    console.log('Message:', error.message);

    // Handle different error types
    switch (error.name) {
      case 'InsufficientFundsError':
        console.log('\n💡 Solution: Add more XNA to your wallet');
        console.log('   Required:', error.required || 'N/A', 'XNA');
        break;

      case 'AssetExistsError':
        console.log('\n💡 Solution: Choose a different asset name');
        console.log('   Taken name:', error.assetName);
        break;

      case 'OwnerTokenNotFoundError':
        console.log('\n💡 Solution: You need the owner token');
        console.log('   Required token:', error.ownerTokenName);
        break;

      case 'InvalidAssetNameError':
        console.log('\n💡 Solution: Fix the asset name');
        console.log('   Rules: 3-30 chars, A-Z 0-9 _ . only');
        break;

      default:
        console.log('\n💡 Solution: Check error message above');
    }
  }
}

// Example: Query and update configuration
async function dynamicConfiguration() {
  const wallet = {
    rpc: async (method, params) => null,
    getAllAddresses: () => ['NAddress1...', 'NAddress2...'],
    getChangeAddress: () => 'NChangeAddress...',
    getReceivingAddress: () => 'NReceivingAddress...'
  };

  const assets = new NeuraiAssets(wallet.rpc.bind(wallet), {
    network: 'xna',
    addresses: wallet.getAllAddresses(),
    changeAddress: wallet.getChangeAddress(),
    toAddress: wallet.getReceivingAddress()
  });

  console.log('=== Dynamic Configuration ===\n');

  console.log('Initial config:');
  console.log('  Addresses:', wallet.getAllAddresses());
  console.log('  Change:', wallet.getChangeAddress());

  // Update configuration (e.g., after wallet generates new addresses)
  console.log('\nUpdating configuration...');

  assets.updateConfig({
    addresses: ['NAddress1...', 'NAddress2...', 'NAddress3...'],
    changeAddress: 'NNewChangeAddress...',
    toAddress: 'NNewReceivingAddress...'
  });

  console.log('✓ Configuration updated');
  console.log('  New addresses: 3');
}

// Run the examples
console.log('=== Example 1: Complete Integration ===\n');
completeWalletIntegration();

console.log('\n\n=== Example 2: Create Multiple Assets ===\n');
createMultipleAssets();

console.log('\n\n=== Example 3: Error Handling ===\n');
errorHandlingExample();

console.log('\n\n=== Example 4: Dynamic Configuration ===\n');
dynamicConfiguration();
