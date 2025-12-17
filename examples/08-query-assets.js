/**
 * Example: Query Asset Information
 *
 * This example demonstrates how to query asset information from the blockchain.
 * Includes various query methods for asset metadata, holders, balances, and more.
 *
 * All query methods are read-only and do not require signing transactions.
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function queryAssetMetadata() {
  // Mock RPC function (replace with your actual RPC client)
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Your RPC implementation here
    // Mock response:
    return {
      name: 'MYTOKEN',
      amount: 1000000,
      units: 2,
      reissuable: true,
      has_ipfs: true,
      ipfs_hash: 'QmExample...'
    };
  };

  // Initialize NeuraiAssets
  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== Query Asset Metadata ===\n');

    // Get complete asset data
    const assetData = await assets.getAssetData('MYTOKEN');

    console.log('Asset Information:');
    console.log('- Name:', assetData.name);
    console.log('- Total Supply:', assetData.amount);
    console.log('- Decimals:', assetData.units);
    console.log('- Reissuable:', assetData.reissuable ? 'Yes' : 'No (locked)');
    console.log('- Has IPFS:', assetData.has_ipfs ? 'Yes' : 'No');
    if (assetData.has_ipfs) {
      console.log('- IPFS Hash:', assetData.ipfs_hash);
    }

    // Detect asset type
    const assetType = assets.getAssetType('MYTOKEN');
    console.log('- Type:', assetType);

  } catch (error) {
    console.error('Error querying asset:', error.message);

    if (error.name === 'AssetNotFoundError') {
      console.error('Asset does not exist on the blockchain');
    }
  }
}

// Example: List all assets
async function listAllAssets() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Mock: return list of assets
    return ['MYTOKEN', 'ANOTHER', 'EXAMPLE'];
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== List All Assets ===\n');

    // List all assets (simple list)
    const allAssets = await assets.listAssets('*', false, 100, 0);
    console.log(`Total assets found: ${allAssets.length}`);
    console.log('Assets:', allAssets.slice(0, 10));

    // Filter by pattern
    console.log('\n=== Filter Assets by Pattern ===\n');
    const myAssets = await assets.listAssets('MY*', false, 100, 0);
    console.log('Assets starting with MY:', myAssets);

    // Get detailed information
    console.log('\n=== Get Detailed Information ===\n');
    const detailed = await assets.listAssets('MYTOKEN', true, 1, 0);
    console.log('Detailed data:', JSON.stringify(detailed, null, 2));

  } catch (error) {
    console.error('Error listing assets:', error.message);
  }
}

// Example: Query wallet assets
async function queryMyAssets() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Mock: return wallet assets
    return {
      'MYTOKEN': 1000.50,
      'ANOTHER': 500.25,
      'NFT#001': 1
    };
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== My Asset Balances ===\n');

    // Get all assets owned by wallet
    const myAssets = await assets.listMyAssets();

    console.log('Assets in wallet:');
    for (const [assetName, balance] of Object.entries(myAssets)) {
      console.log(`- ${assetName}: ${balance}`);
    }

    const totalAssets = Object.keys(myAssets).length;
    console.log(`\nTotal different assets: ${totalAssets}`);

  } catch (error) {
    console.error('Error querying wallet assets:', error.message);
  }
}

// Example: Query asset holders
async function queryAssetHolders() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Mock: return holders
    return [
      { address: 'NAddress1...', amount: 500.00 },
      { address: 'NAddress2...', amount: 300.00 },
      { address: 'NAddress3...', amount: 200.00 }
    ];
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== Asset Holders ===\n');

    const assetName = 'MYTOKEN';

    // Get all holders
    const holders = await assets.listAddressesByAsset(assetName);

    console.log(`Holders of ${assetName}:`);
    holders.forEach((holder, index) => {
      console.log(`${index + 1}. ${holder.address}: ${holder.amount}`);
    });

    console.log(`\nTotal holders: ${holders.length}`);

    // Get holder count only
    console.log('\n=== Get Holder Count ===\n');
    const count = await assets.listAddressesByAsset(assetName, true);
    console.log(`Number of holders: ${count}`);

  } catch (error) {
    console.error('Error querying holders:', error.message);
  }
}

// Example: Query address balances
async function queryAddressBalances() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    // Mock: return balances
    return [
      { asset: 'MYTOKEN', amount: 100.50 },
      { asset: 'ANOTHER', amount: 50.25 },
      { asset: 'NFT#001', amount: 1 }
    ];
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== Address Asset Balances ===\n');

    const address = 'NTestAddress...';

    // Get all assets for an address
    const balances = await assets.listAssetBalancesByAddress(address);

    console.log(`Assets owned by ${address}:`);
    balances.forEach((balance, index) => {
      console.log(`${index + 1}. ${balance.asset}: ${balance.amount}`);
    });

    console.log(`\nTotal assets: ${balances.length}`);

  } catch (error) {
    console.error('Error querying address balances:', error.message);
  }
}

// Example: Check existence and detect type
async function checkAssetExistence() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    return null; // Mock
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== Check Asset Existence ===\n');

    const assetsToCheck = [
      'MYTOKEN',
      'MYTOKEN/SUB',
      'MYTOKEN#NFT001',
      '#KYC_VERIFIED',
      '$SECURITY',
      'MYTOKEN!',
      'NONEXISTENT'
    ];

    for (const assetName of assetsToCheck) {
      const exists = await assets.assetExists(assetName);
      const type = assets.getAssetType(assetName);

      console.log(`${assetName}:`);
      console.log(`  Exists: ${exists ? 'Yes ✓' : 'No ✗'}`);
      console.log(`  Type: ${type}`);
      console.log('');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Advanced queries with pagination
async function advancedQueries() {
  const rpc = async (method, params) => {
    console.log(`RPC Call: ${method}`, params);
    return [];
  };

  const assets = new NeuraiAssets(rpc, {
    network: 'xna',
    addresses: ['NYourAddress1...'],
    changeAddress: 'NChangeAddress...',
    toAddress: 'NReceivingAddress...'
  });

  try {
    console.log('=== Advanced Queries with Pagination ===\n');

    // Paginate through all assets
    console.log('Getting all assets in pages of 100:');

    let page = 0;
    let allAssets = [];
    let hasMore = true;

    while (hasMore) {
      const assets = await assets.listAssets('*', false, 100, page * 100);

      if (assets.length === 0) {
        hasMore = false;
      } else {
        allAssets = allAssets.concat(assets);
        console.log(`Page ${page + 1}: ${assets.length} assets`);
        page++;
      }

      // Safety limit
      if (page > 10) break;
    }

    console.log(`\nTotal assets retrieved: ${allAssets.length}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the examples
console.log('=== Example 1: Query Asset Metadata ===\n');
queryAssetMetadata();

console.log('\n\n=== Example 2: List All Assets ===\n');
listAllAssets();

console.log('\n\n=== Example 3: Query Wallet Assets ===\n');
queryMyAssets();

console.log('\n\n=== Example 4: Query Asset Holders ===\n');
queryAssetHolders();

console.log('\n\n=== Example 5: Query Address Balances ===\n');
queryAddressBalances();

console.log('\n\n=== Example 6: Check Asset Existence ===\n');
checkAssetExistence();

console.log('\n\n=== Example 7: Advanced Queries ===\n');
advancedQueries();
