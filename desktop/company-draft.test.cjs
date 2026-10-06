const test = require('node:test');
const assert = require('node:assert');

let modulePromise;
function loadCompanyDraftModule() {
  if (!modulePromise) {
    modulePromise = import('../src/lib/company-draft.ts');
  }
  return modulePromise;
}

test('annualIncome: 450.5 rounds to 451', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 450.5 }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, 451);
});

test('annualIncome: 450.49 rounds to 450', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 450.49 }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, 450);
});

test('annualIncome: 0.5 rounds to 1', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 0.5 }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, 1);
});

test('annualIncome: 0 remains 0', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 0 }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, 0);
});

test('annualIncome: null remains null', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: null }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, null);
});

test('annualIncome: omitted remains null', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業' }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, null);
});

test('annualIncome: upper boundary 100000 accepted', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();
  const res = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 100000 }));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.draft.annualIncome, 100000);
});

test('annualIncome: out of range negative and >100000 rejected before rounding', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();

  // -0.1 would round to 0 if rounded before validation, but must be rejected
  const resNegFraction = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: -0.1 }));
  assert.strictEqual(resNegFraction.ok, false);
  assert.match(resNegFraction.error, /0〜100000の範囲/);

  const resNegInt = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: -1 }));
  assert.strictEqual(resNegInt.ok, false);
  assert.match(resNegInt.error, /0〜100000の範囲/);

  // 100000.1 would round to 100000 if rounded before validation, but must be rejected
  const resOverFraction = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 100000.1 }));
  assert.strictEqual(resOverFraction.ok, false);
  assert.match(resOverFraction.error, /0〜100000の範囲/);

  const resOverInt = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 100001 }));
  assert.strictEqual(resOverInt.ok, false);
  assert.match(resOverInt.error, /0〜100000の範囲/);
});

test('annualIncome: malformed types reject', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();

  // numeric strings
  const resStr = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: '450' }));
  assert.strictEqual(resStr.ok, false);
  assert.match(resStr.error, /数値または null で指定してください/);

  const resStrFraction = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: '450.5' }));
  assert.strictEqual(resStrFraction.ok, false);
  assert.match(resStrFraction.error, /数値または null で指定してください/);

  // booleans
  const resBoolTrue = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: true }));
  assert.strictEqual(resBoolTrue.ok, false);
  assert.match(resBoolTrue.error, /数値または null で指定してください/);

  const resBoolFalse = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: false }));
  assert.strictEqual(resBoolFalse.ok, false);
  assert.match(resBoolFalse.error, /数値または null で指定してください/);

  // arrays
  const resArray = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: [450] }));
  assert.strictEqual(resArray.ok, false);
  assert.match(resArray.error, /数値または null で指定してください/);

  // objects
  const resObj = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: { amount: 450 } }));
  assert.strictEqual(resObj.ok, false);
  assert.match(resObj.error, /数値または null で指定してください/);
});

test('other integer fields reject fractions', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();

  const resStartingSalary = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', startingSalary: 250000.5 }));
  assert.strictEqual(resStartingSalary.ok, false);
  assert.match(resStartingSalary.error, /初任給（月額・円）（startingSalary）は整数で指定してください/);

  const resBonusTimes = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', bonusTimes: 2.5 }));
  assert.strictEqual(resBonusTimes.ok, false);
  assert.match(resBonusTimes.error, /賞与回数（bonusTimes）は整数で指定してください/);

  const resAnnualHolidays = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualHolidays: 120.5 }));
  assert.strictEqual(resAnnualHolidays.ok, false);
  assert.match(resAnnualHolidays.error, /年間休日（annualHolidays）は整数で指定してください/);

  const resRatingSalary = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', ratingSalary: 3.5 }));
  assert.strictEqual(resRatingSalary.ok, false);
  assert.match(resRatingSalary.error, /給与レーティング（ratingSalary）は整数で指定してください/);

  const resRatingBenefits = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', ratingBenefits: 3.5 }));
  assert.strictEqual(resRatingBenefits.ok, false);
  assert.match(resRatingBenefits.error, /福利厚生レーティング（ratingBenefits）は整数で指定してください/);
});

test('bonusMonths decimals pass', async () => {
  const { parseCompanyDraft } = await loadCompanyDraftModule();

  const resBonusMonths = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', bonusMonths: 4.5 }));
  assert.strictEqual(resBonusMonths.ok, true);
  assert.strictEqual(resBonusMonths.draft.bonusMonths, 4.5);

  const resBonusMonthsQuarter = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', bonusMonths: 2.25 }));
  assert.strictEqual(resBonusMonthsQuarter.ok, true);
  assert.strictEqual(resBonusMonthsQuarter.draft.bonusMonths, 2.25);
});

test('buildCompanyPayload rounded same as draft', async () => {
  const { parseCompanyDraft, buildCompanyPayload } = await loadCompanyDraftModule();

  const res450_5 = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 450.5 }));
  assert.strictEqual(res450_5.ok, true);
  assert.strictEqual(res450_5.draft.annualIncome, 451);
  const payload450_5 = buildCompanyPayload(res450_5.draft);
  assert.strictEqual(payload450_5.annualIncome, 451);
  assert.strictEqual(payload450_5.annualIncome, res450_5.draft.annualIncome);

  const res450_49 = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 450.49 }));
  assert.strictEqual(res450_49.ok, true);
  assert.strictEqual(res450_49.draft.annualIncome, 450);
  const payload450_49 = buildCompanyPayload(res450_49.draft);
  assert.strictEqual(payload450_49.annualIncome, 450);
  assert.strictEqual(payload450_49.annualIncome, res450_49.draft.annualIncome);

  const res0_5 = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 0.5 }));
  assert.strictEqual(res0_5.ok, true);
  assert.strictEqual(res0_5.draft.annualIncome, 1);
  const payload0_5 = buildCompanyPayload(res0_5.draft);
  assert.strictEqual(payload0_5.annualIncome, 1);
  assert.strictEqual(payload0_5.annualIncome, res0_5.draft.annualIncome);

  const res0 = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 0 }));
  assert.strictEqual(res0.ok, true);
  assert.strictEqual(res0.draft.annualIncome, 0);
  const payload0 = buildCompanyPayload(res0.draft);
  assert.strictEqual(payload0.annualIncome, 0);
  assert.strictEqual(payload0.annualIncome, res0.draft.annualIncome);

  const resNull = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: null }));
  assert.strictEqual(resNull.ok, true);
  assert.strictEqual(resNull.draft.annualIncome, null);
  const payloadNull = buildCompanyPayload(resNull.draft);
  assert.strictEqual(payloadNull.annualIncome, null);
  assert.strictEqual(payloadNull.annualIncome, resNull.draft.annualIncome);

  const resOmitted = parseCompanyDraft(JSON.stringify({ name: 'テスト企業' }));
  assert.strictEqual(resOmitted.ok, true);
  assert.strictEqual(resOmitted.draft.annualIncome, null);
  const payloadOmitted = buildCompanyPayload(resOmitted.draft);
  assert.strictEqual(payloadOmitted.annualIncome, null);
  assert.strictEqual(payloadOmitted.annualIncome, resOmitted.draft.annualIncome);

  const resUpper = parseCompanyDraft(JSON.stringify({ name: 'テスト企業', annualIncome: 100000 }));
  assert.strictEqual(resUpper.ok, true);
  assert.strictEqual(resUpper.draft.annualIncome, 100000);
  const payloadUpper = buildCompanyPayload(resUpper.draft);
  assert.strictEqual(payloadUpper.annualIncome, 100000);
  assert.strictEqual(payloadUpper.annualIncome, resUpper.draft.annualIncome);
});
