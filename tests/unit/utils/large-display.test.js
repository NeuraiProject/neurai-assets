const {expect}=require('chai');
const {rawToDisplayAmount,xnaAmountToSats}=require('../../../src/utils/assetAmount');
const OutputOrderer=require('../../../src/managers/OutputOrderer');
describe('large amounts remain exact through display envelopes',()=>{
 it('keeps large fractional change as text and safe values as numbers',()=>{
  expect(rawToDisplayAmount(10000000000000001n)).to.equal('100000000.00000001');
  expect(rawToDisplayAmount(2100000000000000000n)).to.equal(21000000000);
  expect(rawToDisplayAmount(100000001n)).to.equal(1.00000001);
 });
 it('never drops an exact string XNA output while ordering',()=>{
  const orderer=new OutputOrderer();
  const outputs=orderer.order([{asset:{transfer:{TEST:1}}},{change:'100000000.00000001'}]);
  expect(outputs).to.deep.equal([{change:'100000000.00000001'},{asset:{transfer:{TEST:1}}}]);
 });
 it('rejects unsafe decimal numbers and monetary overflow in XNA conversion',()=>{
  expect(()=>xnaAmountToSats(100000000.00000001)).to.throw();
  expect(()=>xnaAmountToSats('21000000000.00000001')).to.throw();
 });
});
const AmountConverter=require('../../../src/utils/amountConverter');
it('legacy number-only conversion helpers fail closed above their numeric range',()=>{
 expect(()=>AmountConverter.toSatoshis(100000000,8)).to.throw(/Unsafe/);
 expect(()=>AmountConverter.fromSatoshis(9007199254740992,8)).to.throw();
 expect(()=>AmountConverter.parse('100000000.00000001')).to.throw(/Unsafe/);
 expect(()=>AmountConverter.parse('1junk')).to.throw();
});
