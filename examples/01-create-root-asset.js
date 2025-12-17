/**
 * Example: Create a ROOT Asset
 *
 * This example demonstrates how to create a ROOT asset (standard token).
 * ROOT assets are the base asset type in Neurai.
 *
 * Cost: 1000 XNA (burned)
 * Creates: MYTOKEN + MYTOKEN! (owner token)
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function createRootAsset() {
  // Mock RPC function (replace with your actual RPC client)
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Your RPC implementation here
    // return await yourRpcClient.call(method, params);
  };

  // Initialize NeuraiAssets
  const assets = new NeuraiAssets(rpc, {
    network: 'xna',                          // 'xna' for mainnet, 'xna-test' for testnet
    addresses: ['NYourAddress1...'],         // Your wallet addresses
    changeAddress: 'NChangeAddress...',      // Address to receive change
    toAddress: 'NReceivingAddress...'        // Address to receive the new asset
  });

  try {
    // Create a ROOT asset
    const result = await assets.createRootAsset({
      assetName: 'MYTOKEN',       // Asset name (3-30 chars, A-Z 0-9 _ .)
      quantity: 1000000,           // Total supply
      units: 2,                    // Decimals (0-8), 2 means divisible by 0.01
      reissuable: true,            // Allow minting more supply later
      hasIpfs: true,               // Whether to include IPFS metadata
      ipfsHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'  // IPFS hash
    });

    console.log('Transaction created successfully!');
    console.log('Raw Transaction (hex):', result.rawTx);
    console.log('Fee:', result.fee, 'XNA');
    console.log('Burn:', result.burn, 'XNA');
    console.log('Owner Token:', result.metadata.ownerTokenName);

    // Next steps:
    // 1. Sign the raw transaction with your wallet
    // 2. Broadcast the signed transaction to the network
    // 3. Wait for confirmation

    // Example with wallet integration:
    // const signedTx = await wallet.signTransaction(result.rawTx);
    // const txid = await wallet.broadcastTransaction(signedTx);
    // console.log('Transaction ID:', txid);

  } catch (error) {
    console.error('Error creating ROOT asset:', error.message);

    // Handle specific errors
    if (error.name === 'AssetExistsError') {
      console.error('This asset already exists on the blockchain');
    } else if (error.name === 'InsufficientFundsError') {
      console.error('Not enough XNA to pay for the transaction');
    } else if (error.name === 'InvalidAssetNameError') {
      console.error('Invalid asset name format');
    }
  }
}

// Run the example
createRootAsset();
