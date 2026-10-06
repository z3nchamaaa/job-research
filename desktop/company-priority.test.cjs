const test = require('node:test');
const assert = require('node:assert/strict');

test('志望度は1〜5の整数のみ受け付ける', async () => {
  const { isCompanyPriority } = await import('../src/lib/company-priority.ts');
  for (const value of [1,2,3,4,5]) assert.equal(isCompanyPriority(value),true);
  for (const value of [0,6,-1,2.5,NaN,Infinity,null,undefined,'3','',true,[],{}]) {
    assert.equal(isCompanyPriority(value),false);
  }
});
