/**
 * Valid Neurai testnet addresses for fixtures.
 *
 * These are real, checksum-valid addresses generated with
 * @neuraiproject/neurai-key (`generateAddressObject('xna-test')` and
 * `generatePQAddressObject('xna-pq-test')`). They are hardcoded rather than
 * regenerated per run so a failing assertion always points at the same
 * address, and because create-transaction decodes them for real — an
 * invented string fails with "Invalid checksum" instead of testing anything.
 *
 * No private keys are involved: the builders never sign.
 */

/** Legacy P2PKH testnet addresses. */
const ADDR = [
  't7pvKtaVzbcsUijMT3z8KA4bkF1XxUiKqN',
  'tJPfxZBNU3XT38V9t3wVbKNFfDBFo4ZEGa',
  'tSshgkz6H8SFp279w6b3q3BebhavcTJh6n',
  'tKaZScV8Jfsyd5BrucfKBENbHw4nP54WhJ',
  'tFokgPTwBokayHScyfBy74t3QdoumvbwnL'
];

/** AuthScript (PQ) witness-v1 testnet destinations. */
const PQ_ADDR = [
  'tnq1p432fs3tk3226vpmjdal52f4s9fplrt9rz2clmduudcesz93ht7ys7nm0ag',
  'tnq1peq2pk2t3y8pfl5j608vshkdxgz96ugspsxx9x4lwhyte446apy6sqxqkcu',
  'tnq1pdha9kxh5dcdt62lq83cr2z95dxxrfmtl5g8dq32yjtg5eqj768jqleztze'
];

/** Testnet global burn address used by regtest chainparams. */
const REGTEST_BURN = 'tBURNXXXXXXXXXXXXXXXXXXXXXXXVZLroy';

module.exports = { ADDR, PQ_ADDR, REGTEST_BURN };
