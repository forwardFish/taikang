import { gunzipSync } from 'node:zlib';

const suiteModels = new Map();

function suitePlan({ product, input, columns: keys }, wantsPdf) {
  if (!Object.hasOwn(suiteModelData, product) || !input || typeof input !== 'object') {
    throw new Error('请选择产品版本，并填写投保信息。');
  }
  const { age, sex, term, premium, rate, dividend, start, receive, withdrawals } = input;
  if (!Number.isInteger(age) || !Number.isInteger(term) || !['M', 'F'].includes(sex) ||
      !Number.isFinite(premium) || !Number.isFinite(dividend) ||
      withdrawals != null && (!Array.isArray(withdrawals) || withdrawals.length > 212 ||
        withdrawals.some(item => !item || !Number.isFinite(item.amount)))) {
    throw new Error('请检查投保信息、演示参数和领取金额。');
  }
  const values = product === 'xingfu' ? normalizePlanInput(input) : {
    age, sex, term, premium, rate, dividend, start,
    withdrawals: withdrawals?.map(({ year, cell, amount }) => ({ year, cell, amount })),
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
