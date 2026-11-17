import { gunzipSync } from 'node:zlib';

const suiteModels = new Map();

function suitePlan({ product, input, columns: keys }, wantsPdf) {
  if (!Object.hasOwn(suiteModelData, product) || !input || typeof input !== 'object') {
    throw new Error('请选择产品版本，并填写投保信息。');
  }
  const { age, sex, term, premium, rate, dividend, start, withdrawals, withdrawalStages } = input;
  if (!Number.isInteger(age) || !Number.isInteger(term) || !['M', 'F'].includes(sex) ||
      !Number.isFinite(premium) || !Number.isFinite(dividend) ||
      withdrawals != null && (!Array.isArray(withdrawals) || withdrawals.length > 212 ||
        withdrawals.some(item => !item || !Number.isFinite(item.amount)))) {
    throw new Error('请检查投保信息、演示参数和领取金额。');
  }
  if (withdrawalStages != null && (!Array.isArray(withdrawalStages) || withdrawalStages.length > MAX_POLICY_YEARS)) {
    throw new Error('请检查万能账户领取阶段。');
  }
  const values = {
    ...(SUITE_PRODUCTS[product].lumpPayout ? normalizePlanInput(input) : { age, sex, term, premium, rate, dividend, start }),
    ...(withdrawals != null && { withdrawals: withdrawals.map(({ year, cell, amount }) => ({ year, cell, amount })) }),
    ...(withdrawalStages != null && { withdrawalStages: withdrawalStages.map(stage => {
      const { from, to, amount } = stage ?? {};
      return { from, to, amount };
    }) }),
  };
  if (!suiteModels.has(product)) suiteModels.set(product, JSON.parse(gunzipSync(Buffer.from(suiteModelData[product], 'base64'))));
  const model = suiteModels.get(product);
  const columns = suiteColumns(product, model);
  if (wantsPdf && (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length ||
      keys.some(key => !columns.some(column => column.key === key)))) {
    throw new Error('请选择该产品可以展示的项目。');
  }
  const plan = calculateSuite(product, model, values, columns);
  return { plan, columns: wantsPdf ? columns.filter(column => keys.includes(column.key)) : columns };
}
