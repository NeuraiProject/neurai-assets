const { expect } = require('chai');
const { rpcErrorMessage } = require('../../../src/utils/rpcErrorMessage');
const BaseAssetTransactionBuilder = require('../../../src/builders/BaseAssetTransactionBuilder');

// The three shapes @neuraiproject/neurai-rpc >= 0.5 rejects with (its getRPC
// never rejects with a plain Error), plus the plain Errors our mocks throw.
const shape1 = { error: { code: -8, message: 'Asset not found' }, description: 'Asset not found' };
const shape2 = { statusText: 'Internal Server Error', status: 500, description: undefined, error: { code: -5, message: 'Invalid address' } };
const shape2NoBody = { statusText: 'Unauthorized', status: 401, description: null, error: null };
const shape3 = { originalError: new Error('ECONNREFUSED'), type: 'ServerUnreachable', error: 'Could not communicate with Neurai core node', description: '...' };

describe('rpcErrorMessage', () => {
  it('extracts the node message from every rejection shape', () => {
    expect(rpcErrorMessage(shape1)).to.equal('Asset not found');
    expect(rpcErrorMessage(shape2)).to.equal('Invalid address');
    expect(rpcErrorMessage(shape2NoBody)).to.equal('Unauthorized');
    expect(rpcErrorMessage(shape3)).to.equal('Could not communicate with Neurai core node');
    expect(rpcErrorMessage(new Error('plain'))).to.equal('plain');
    expect(rpcErrorMessage('string')).to.equal('string');
    expect(rpcErrorMessage(undefined)).to.equal('');
    expect(rpcErrorMessage({})).to.equal('');
  });

  it('keeps the not-found detection working with real neurai-rpc rejections', async () => {
    const rpc = async (method) => {
      if (method === 'getassetdata') {
        throw shape1; // no .message property at all
      }
      throw new Error(`unexpected: ${method}`);
    };
    const builder = new BaseAssetTransactionBuilder(rpc, 'xna-test', ['tAddr'], {});
    expect(await builder.assetExists('NOPE')).to.equal(false);
    expect(await builder.getAssetData('NOPE')).to.equal(null);
  });

  it('surfaces the node message instead of undefined on other failures', async () => {
    const rpc = async () => { throw shape2; };
    const builder = new BaseAssetTransactionBuilder(rpc, 'xna-test', ['tAddr'], {});
    let failed = null;
    try {
      await builder.buildRawTransaction([], {});
    } catch (error) {
      failed = error;
    }
    expect(failed.message).to.contain('Invalid address');
    expect(failed.message).to.not.contain('undefined');
  });
});
