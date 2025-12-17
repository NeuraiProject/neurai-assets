/**
 * Example: Create RESTRICTED Assets (Security Tokens)
 *
 * This example demonstrates how to create RESTRICTED assets.
 * RESTRICTED assets are security tokens with built-in compliance controls.
 *
 * Format: $NAME (e.g., $SECURITY, $STOCK)
 *
 * Features:
 * - Only addresses meeting verifier requirements can receive/hold
 * - Can freeze individual addresses or entire asset
 * - Uses QUALIFIER tags for compliance (e.g., #KYC_VERIFIED)
 *
 * Cost: 3000 XNA (most expensive asset type)
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function createRestrictedAsset() {
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
    // Step 1: Ensure qualifiers exist
    console.log('=== Step 1: Verify Qualifiers Exist ===\n');

    // You need to create qualifiers first (see example 05)
    const requiredQualifiers = ['#KYC_VERIFIED', '#ACCREDITED'];

    for (const qualifier of requiredQualifiers) {
      const exists = await assets.assetExists(qualifier);
      if (!exists) {
        console.warn(`⚠ Qualifier ${qualifier} does not exist. Create it first!`);
        // You would need to create it using createQualifier()
      } else {
        console.log(`✓ Qualifier ${qualifier} exists`);
      }
    }

    // Step 2: Create the RESTRICTED asset with verifier string
    console.log('\n=== Step 2: Create RESTRICTED Asset ===\n');

    const result = await assets.createRestrictedAsset({
      assetName: '$SECURITY',                              // Must start with $
      quantity: 1000000,                                   // Total supply
      units: 2,                                            // Decimals (0-8)
      verifierString: '#KYC_VERIFIED & #ACCREDITED',      // Boolean logic
      reissuable: true,                                    // Allow reissuance
      hasIpfs: true,
      ipfsHash: 'QmSecurityTokenMetadata...'
    });

    console.log('RESTRICTED Asset created successfully!');
    console.log('Asset Name:', '$SECURITY');
    console.log('Owner Token:', '$SECURITY!');
    console.log('Verifier String:', result.metadata.verifierString);
    console.log('Required Qualifiers:', result.metadata.requiredQualifiers);
    console.log('Burn:', result.burn, 'XNA');

    console.log('\n=== Verifier String Explained ===');
    console.log('Verifier: #KYC_VERIFIED & #ACCREDITED');
    console.log('Meaning: Address must have BOTH tags to receive this asset');
    console.log('- #KYC_VERIFIED (required)');
    console.log('- #ACCREDITED (required)');

    console.log('\nNext steps:');
    console.log('1. Tag addresses with required qualifiers');
    console.log('2. Only tagged addresses can receive $SECURITY');
    console.log('3. Use owner token ($SECURITY!) to manage the asset');

  } catch (error) {
    console.error('Error creating RESTRICTED asset:', error.message);

    if (error.name === 'InvalidVerifierStringError') {
      console.error('Invalid verifier string syntax');
    }
  }
}

// Example: Create RESTRICTED asset with complex verifier logic
async function createRestrictedWithComplexVerifier() {
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
    // Create RESTRICTED asset with OR logic
    const result = await assets.createRestrictedAsset({
      assetName: '$FLEXIBLE_TOKEN',
      quantity: 500000,
      units: 0,
      // Complex verifier: (KYC AND Accredited) OR Institutional
      verifierString: '(#KYC_VERIFIED & #ACCREDITED) | #INSTITUTIONAL',
      reissuable: true,
      hasIpfs: false,
      ipfsHash: ''
    });

    console.log('RESTRICTED Asset with complex verifier created!');
    console.log('Asset:', '$FLEXIBLE_TOKEN');
    console.log('Verifier:', result.metadata.verifierString);

    console.log('\n=== Verifier Logic ===');
    console.log('Option 1: Address has #KYC_VERIFIED AND #ACCREDITED');
    console.log('Option 2: Address has #INSTITUTIONAL');
    console.log('Result: Address can receive if either option is true');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Validate verifier string before creating asset
async function validateVerifierString() {
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
    // Test different verifier strings
    const verifiers = [
      '#KYC_VERIFIED',                                    // Simple
      '#KYC_VERIFIED & #ACCREDITED',                      // AND
      '#KYC_VERIFIED | #INSTITUTIONAL',                   // OR
      '(#KYC_VERIFIED & #ACCREDITED) | #INSTITUTIONAL',  // Complex
      '#KYC & (#ACCREDITED | #INSTITUTIONAL)',            // Nested
      'INVALID STRING',                                   // Invalid
    ];

    console.log('=== Verifier String Validation ===\n');

    for (const verifier of verifiers) {
      const isValid = await assets.isValidVerifierString(verifier);
      console.log(`${isValid ? '✓' : '✗'} "${verifier}"`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Check if address can receive restricted asset
async function checkAddressCompliance() {
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
    const testAddress = 'NTestAddress...';
    const restrictedAsset = '$SECURITY';

    console.log('=== Compliance Check ===\n');
    console.log(`Address: ${testAddress}`);
    console.log(`Asset: ${restrictedAsset}`);

    // Check if address meets verifier requirements
    const canReceive = await assets.checkAddressRestriction(
      testAddress,
      restrictedAsset
    );

    console.log(`\nCan receive asset: ${canReceive ? 'YES ✓' : 'NO ✗'}`);

    if (!canReceive) {
      // Check what tags the address has
      const tags = await assets.listTagsForAddress(testAddress);
      console.log('\nCurrent tags:', tags.length > 0 ? tags : 'None');

      // Get verifier requirements
      const verifier = await assets.getVerifierString(restrictedAsset);
      console.log('Required verifier:', verifier);
      console.log('\nThe address needs to be tagged with required qualifiers');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the examples
console.log('=== Example 1: Create Simple RESTRICTED Asset ===\n');
createRestrictedAsset();

console.log('\n\n=== Example 2: Create with Complex Verifier ===\n');
createRestrictedWithComplexVerifier();

console.log('\n\n=== Example 3: Validate Verifier Strings ===\n');
validateVerifierString();

console.log('\n\n=== Example 4: Check Address Compliance ===\n');
checkAddressCompliance();
