/**
 * Neurai Asset Types
 * Based on: src/assets/assettypes.h
 */

const AssetType = {
  ROOT: 0,           // Top-level asset (Cost: 1000 XNA)
  SUB: 1,            // Sub-asset (Cost: 200 XNA, requires PARENT!)
  UNIQUE: 2,         // NFT/Unique asset (Cost: 10 XNA per token)
  MSGCHANNEL: 3,     // Message channel (Cost: 200 XNA, legacy)
  QUALIFIER: 4,      // KYC qualifier tag (Cost: 2000 XNA)
  SUB_QUALIFIER: 5,  // Sub-qualifier (Cost: 200 XNA)
  RESTRICTED: 6,     // Restricted/security token (Cost: 3000 XNA)
  VOTE: 7,           // Voting asset (Reserved for future use)
  REISSUE: 8,        // Reissuance operation (Cost: 200 XNA)
  OWNER: 9,          // Owner token (Cost: 0 XNA, auto-generated)
  NULL_ADD_QUALIFIER: 10,  // Qualifier assignment (Cost: 0.1 XNA)
  DEPIN: 12          // Soulbound DePIN asset (Testnet only)
};

module.exports = {
  AssetType
};
