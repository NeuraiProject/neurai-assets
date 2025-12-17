/**
 * Example: Freeze and Unfreeze Operations
 *
 * This example demonstrates how to freeze/unfreeze addresses and assets.
 * Freezing is only available for RESTRICTED assets.
 *
 * Requirements:
 * - Must own the restricted asset's owner token ($ASSET!)
 *
 * Operations:
 * - Freeze specific addresses (prevent trading)
 * - Unfreeze specific addresses (allow trading again)
 * - Global freeze (freeze entire asset)
 * - Global unfreeze (unfreeze entire asset)
 *
 * Cost: No burn (only network fee)
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function freezeAddresses() {
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
    const restrictedAsset = '$SECURITY';
    const ownerToken = `${restrictedAsset}!`;

    // Step 1: Verify you own the owner token
    console.log('=== Step 1: Verify Owner Token ===\n');

    const myAssets = await assets.listMyAssets(ownerToken);
    if (!myAssets[ownerToken]) {
      throw new Error(`You must own ${ownerToken} to freeze/unfreeze`);
    }

    console.log(`✓ Owner token found: ${ownerToken}`);

    // Step 2: Freeze specific addresses
    console.log('\n=== Step 2: Freeze Addresses ===\n');

    const addressesToFreeze = [
      'NAddressToFreeze1...',
      'NAddressToFreeze2...',
      'NAddressToFreeze3...'
    ];

    const freezeResult = await assets.freezeAddresses({
      assetName: restrictedAsset,
      addresses: addressesToFreeze
    });

    console.log('Addresses frozen successfully!');
    console.log('Asset:', freezeResult.metadata.assetName);
    console.log('Addresses frozen:', freezeResult.metadata.addressCount);
    console.log('Fee:', freezeResult.fee, 'XNA');
    console.log('Burn:', freezeResult.burn, 'XNA (no burn for freeze operations)');

    console.log('\nFrozen addresses:');
    freezeResult.metadata.targetAddresses.forEach((addr, i) => {
      console.log(`${i + 1}. ${addr}`);
    });

    console.log('\nEffect: These addresses can NO LONGER:');
    console.log('- Send the restricted asset');
    console.log('- Receive the restricted asset');
    console.log('- Trade the restricted asset');

    // Step 3: Check if address is frozen
    console.log('\n=== Step 3: Verify Freeze Status ===\n');

    for (const address of addressesToFreeze) {
      const isFrozen = await assets.isAddressFrozen(address, restrictedAsset);
      console.log(`${address}: ${isFrozen ? 'FROZEN ❄️' : 'ACTIVE ✓'}`);
    }

  } catch (error) {
    console.error('Error freezing addresses:', error.message);

    if (error.name === 'OwnerTokenNotFoundError') {
      console.error('You need the owner token to freeze addresses');
    }
  }
}

// Example: Unfreeze addresses
async function unfreezeAddresses() {
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
    const restrictedAsset = '$SECURITY';
    const addressesToUnfreeze = [
      'NAddressToUnfreeze1...',
      'NAddressToUnfreeze2...'
    ];

    console.log('=== Unfreezing Addresses ===\n');

    const result = await assets.unfreezeAddresses({
      assetName: restrictedAsset,
      addresses: addressesToUnfreeze
    });

    console.log('Addresses unfrozen successfully!');
    console.log('Addresses unfrozen:', result.metadata.addressCount);
    console.log('Fee:', result.fee, 'XNA');

    console.log('\nThese addresses can now:');
    console.log('- Send the restricted asset');
    console.log('- Receive the restricted asset');
    console.log('- Trade the restricted asset');
    console.log('(if they still meet verifier requirements)');

  } catch (error) {
    console.error('Error unfreezing addresses:', error.message);
  }
}

// Example: Global freeze (freeze entire asset)
async function freezeAssetGlobally() {
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
    const restrictedAsset = '$SECURITY';

    console.log('=== Global Asset Freeze ===\n');
    console.log('⚠️  WARNING: This will freeze the ENTIRE asset!');
    console.log('ALL addresses will be unable to trade this asset.\n');

    const result = await assets.freezeAssetGlobally({
      assetName: restrictedAsset
    });

    console.log('Asset frozen globally!');
    console.log('Asset:', result.metadata.assetName);
    console.log('Operation:', result.metadata.operationType);
    console.log('Fee:', result.fee, 'XNA');

    console.log('\nEffect:');
    console.log('- ALL addresses are frozen for this asset');
    console.log('- Nobody can send/receive/trade');
    console.log('- Use for emergency situations or regulatory compliance');

    // Verify global freeze status
    const isGloballyFrozen = await assets.checkGlobalRestriction(restrictedAsset);
    console.log(`\nGlobal freeze status: ${isGloballyFrozen ? 'FROZEN ❄️' : 'ACTIVE ✓'}`);

  } catch (error) {
    console.error('Error freezing asset globally:', error.message);
  }
}

// Example: Global unfreeze (unfreeze entire asset)
async function unfreezeAssetGlobally() {
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
    const restrictedAsset = '$SECURITY';

    console.log('=== Global Asset Unfreeze ===\n');

    const result = await assets.unfreezeAssetGlobally({
      assetName: restrictedAsset
    });

    console.log('Asset unfrozen globally!');
    console.log('Asset:', result.metadata.assetName);
    console.log('Fee:', result.fee, 'XNA');

    console.log('\nEffect:');
    console.log('- Global freeze lifted');
    console.log('- Trading resumes for all addresses');
    console.log('- Individual freezes (if any) remain in effect');
    console.log('- Verifier requirements still apply');

  } catch (error) {
    console.error('Error unfreezing asset globally:', error.message);
  }
}

// Example: Complete freeze workflow
async function completeWorkflow() {
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
    const restrictedAsset = '$SECURITY';
    const suspiciousAddress = 'NSuspiciousAddress...';

    console.log('=== Complete Freeze/Unfreeze Workflow ===\n');

    // Scenario: Detect suspicious activity
    console.log('Scenario: Suspicious activity detected on address');
    console.log(`Address: ${suspiciousAddress}\n`);

    // Step 1: Freeze the suspicious address
    console.log('Step 1: Freeze suspicious address');
    await assets.freezeAddresses({
      assetName: restrictedAsset,
      addresses: [suspiciousAddress]
    });
    console.log('✓ Address frozen\n');

    // Step 2: Verify freeze status
    console.log('Step 2: Verify freeze status');
    const isFrozen = await assets.isAddressFrozen(suspiciousAddress, restrictedAsset);
    console.log(`Status: ${isFrozen ? 'FROZEN ❄️' : 'ACTIVE ✓'}\n`);

    // Step 3: Investigate...
    console.log('Step 3: Investigation period...\n');

    // Step 4: If cleared, unfreeze
    console.log('Step 4: Investigation complete - address cleared');
    await assets.unfreezeAddresses({
      assetName: restrictedAsset,
      addresses: [suspiciousAddress]
    });
    console.log('✓ Address unfrozen\n');

    // Step 5: Verify unfreeze
    console.log('Step 5: Verify final status');
    const isFrozenAfter = await assets.isAddressFrozen(suspiciousAddress, restrictedAsset);
    console.log(`Status: ${isFrozenAfter ? 'FROZEN ❄️' : 'ACTIVE ✓'}\n`);

    console.log('Workflow completed successfully!');

  } catch (error) {
    console.error('Error in workflow:', error.message);
  }
}

// Run the examples
console.log('=== Example 1: Freeze Specific Addresses ===\n');
freezeAddresses();

console.log('\n\n=== Example 2: Unfreeze Addresses ===\n');
unfreezeAddresses();

console.log('\n\n=== Example 3: Global Freeze ===\n');
freezeAssetGlobally();

console.log('\n\n=== Example 4: Global Unfreeze ===\n');
unfreezeAssetGlobally();

console.log('\n\n=== Example 5: Complete Workflow ===\n');
completeWorkflow();
