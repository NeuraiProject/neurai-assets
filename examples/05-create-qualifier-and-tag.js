/**
 * Example: Create QUALIFIERs and Tag Addresses
 *
 * This example demonstrates how to create QUALIFIER assets (KYC/compliance tags)
 * and assign them to addresses. QUALIFIERs are used for compliance in RESTRICTED assets.
 *
 * Format: #NAME (e.g., #KYC_VERIFIED, #ACCREDITED)
 *
 * Costs:
 * - Create QUALIFIER (root): 2000 XNA
 * - Create SUB_QUALIFIER: 200 XNA
 * - Tag/Untag address: 0.1 XNA per address
 */

const NeuraiAssets = require('@neuraiproject/neurai-assets');

async function createQualifierAndTagAddresses() {
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
    // Step 1: Create a QUALIFIER (KYC tag)
    console.log('=== Step 1: Create QUALIFIER ===\n');

    const createResult = await assets.createQualifier({
      qualifierName: '#KYC_VERIFIED',    // Must start with #
      quantity: 1,                        // Usually 1-10 (limited quantity)
      hasIpfs: true,
      ipfsHash: 'QmKYCMetadata...'       // Metadata about the qualifier
    });

    console.log('QUALIFIER created successfully!');
    console.log('Name:', '#KYC_VERIFIED');
    console.log('Owner Token:', '#KYC_VERIFIED!');
    console.log('Burn:', createResult.burn, 'XNA');

    // Step 2: Tag addresses with the qualifier
    console.log('\n=== Step 2: Tag Addresses ===\n');

    const tagResult = await assets.tagAddresses({
      qualifierName: '#KYC_VERIFIED',
      addresses: [
        'NAddress1ToKYC...',
        'NAddress2ToKYC...',
        'NAddress3ToKYC...'
      ],
      assetData: 'KYC expires 2025-12-31'  // Optional data
    });

    console.log('Addresses tagged successfully!');
    console.log('Qualifier:', tagResult.metadata.qualifierName);
    console.log('Addresses tagged:', tagResult.metadata.addressCount);
    console.log('Burn:', tagResult.burn, 'XNA (0.1 per address)');

    // Step 3: Verify tags
    console.log('\n=== Step 3: Verify Tags ===\n');

    for (const address of tagResult.metadata.targetAddresses) {
      const hasTag = await assets.checkAddressTag(address, '#KYC_VERIFIED');
      console.log(`${address}: ${hasTag ? '✓ Tagged' : '✗ Not tagged'}`);
    }

    // Step 4: List all tags for an address
    console.log('\n=== Step 4: List Address Tags ===\n');

    const tags = await assets.listTagsForAddress('NAddress1ToKYC...');
    console.log('Tags for NAddress1ToKYC:');
    tags.forEach(tag => console.log(`- ${tag}`));

  } catch (error) {
    console.error('Error:', error.message);

    if (error.name === 'InvalidAssetNameError') {
      console.error('Qualifier name must start with #');
    } else if (error.name === 'OwnerTokenNotFoundError') {
      console.error('You need the qualifier owner token to tag addresses');
    }
  }
}

// Example: Create multiple qualifiers for different compliance levels
async function createComplianceSystem() {
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
    // Create different compliance qualifiers
    const qualifiers = [
      { name: '#KYC_BASIC', metadata: 'QmBasicKYC...' },
      { name: '#KYC_ADVANCED', metadata: 'QmAdvancedKYC...' },
      { name: '#ACCREDITED_INVESTOR', metadata: 'QmAccredited...' },
      { name: '#INSTITUTIONAL', metadata: 'QmInstitutional...' }
    ];

    console.log('Creating compliance qualifier system...\n');

    for (const qualifier of qualifiers) {
      const result = await assets.createQualifier({
        qualifierName: qualifier.name,
        quantity: 1,
        hasIpfs: true,
        ipfsHash: qualifier.metadata
      });

      console.log(`✓ Created: ${qualifier.name} (burn: ${result.burn} XNA)`);
    }

    console.log('\nCompliance system created!');
    console.log('You can now tag addresses with different compliance levels.');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Remove tags from addresses
async function untagAddresses() {
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
    // Remove KYC tag from addresses
    const result = await assets.untagAddresses({
      qualifierName: '#KYC_VERIFIED',
      addresses: [
        'NAddressToUntag1...',
        'NAddressToUntag2...'
      ]
    });

    console.log('Tags removed successfully!');
    console.log('Addresses untagged:', result.metadata.addressCount);
    console.log('Burn:', result.burn, 'XNA');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example: Create SUB_QUALIFIER
async function createSubQualifier() {
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
    // Create a sub-qualifier (requires parent qualifier owner token)
    const result = await assets.createQualifier({
      qualifierName: '#KYC/#LEVEL_2',   // Format: #PARENT/#SUB
      quantity: 1,
      hasIpfs: true,
      ipfsHash: 'QmLevel2Metadata...'
    });

    console.log('SUB_QUALIFIER created!');
    console.log('Name:', '#KYC/#LEVEL_2');
    console.log('Burn:', result.burn, 'XNA (200 for sub-qualifier)');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the examples
console.log('=== Example 1: Create Qualifier and Tag Addresses ===\n');
createQualifierAndTagAddresses();

console.log('\n\n=== Example 2: Create Compliance System ===\n');
createComplianceSystem();

console.log('\n\n=== Example 3: Untag Addresses ===\n');
untagAddresses();

console.log('\n\n=== Example 4: Create SUB_QUALIFIER ===\n');
createSubQualifier();
