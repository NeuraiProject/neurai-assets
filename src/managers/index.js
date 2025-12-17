/**
 * Managers Module
 * Exports all manager classes
 */

const BurnManager = require('./BurnManager');
const OwnerTokenManager = require('./OwnerTokenManager');
const UTXOSelector = require('./UTXOSelector');
const OutputOrderer = require('./OutputOrderer');

module.exports = {
  BurnManager,
  OwnerTokenManager,
  UTXOSelector,
  OutputOrderer
};
