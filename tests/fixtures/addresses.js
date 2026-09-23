/**
 * Valid Neurai testnet addresses for fixtures.
 *
 * These are real, checksum-valid addresses generated with
 * @neuraiproject/neurai-key and a regtest node. They are hardcoded rather than
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

/**
 * Generic AuthScript witness-v1 testnet destinations (`OP_1 <32B>`). Same
 * commitments as the pre-neurai-key-5 `tnq1p…` fixtures, which the node no
 * longer accepts.
 */
const PQ_ADDR = [
  'tnc1p432fs3tk3226vpmjdal52f4s9fplrt9rz2clmduudcesz93ht7ysv8zn52',
  'tnc1peq2pk2t3y8pfl5j608vshkdxgz96ugspsxx9x4lwhyte446apy6sjje237',
  'tnc1pdha9kxh5dcdt62lq83cr2z95dxxrfmtl5g8dq32yjtg5eqj768jqddmhtm'
];

/** Strict PQ witness-v2 testnet destination (`OP_2 <32B>`), made by a regtest node. */
const STRICT_PQ_ADDR = 'tpq1z5age5p2v5q9w6qzadkjp4yep8gpr56q6mzd4fu6eus8ntulul6vq3q07pc';
const STRICT_PQ_SCRIPT = '5220a7519a054ca00aed005d6da41a93213a023a681ad89b54f359e40f35f3fcfe98';

/** Strict ECDSA witness-v3 testnet destination (`OP_3 <32B>`), made by a regtest node. */
const ECDSA_ADDR = 'tnq1rwentz4njukcn400flwk5tu6s8fmzwd3e408nmkqz6dvfysgcdp2suqptef';
const ECDSA_SCRIPT = '53207666b15672e5b13abde9fbad45f3503a76273639abcf3dd802d3589241186855';

/** Mainnet encodings of the same programs, plus a legacy mainnet address. */
const MAINNET = {
  legacy: 'NLhdtwjgrcEkRqjJZkRY4sjhkJ93EytLeE',
  authScript: 'nc1p8802g0lnexmnvj7up5f55wz4elvj7xf7ytm0n6t95adrhl4vfgcq56vxwz',
  pq: 'pq1z5age5p2v5q9w6qzadkjp4yep8gpr56q6mzd4fu6eus8ntulul6vqseaesh',
  ecdsa: 'nq1rwentz4njukcn400flwk5tu6s8fmzwd3e408nmkqz6dvfysgcdp2saenvgx'
};

/** Testnet global burn address used by regtest chainparams. */
const REGTEST_BURN = 'tBURNXXXXXXXXXXXXXXXXXXXXXXXVZLroy';

module.exports = { ADDR, PQ_ADDR, STRICT_PQ_ADDR, STRICT_PQ_SCRIPT, ECDSA_ADDR, ECDSA_SCRIPT, MAINNET, REGTEST_BURN };
