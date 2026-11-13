import { calculate, COLUMNS, formatValue, payoutChoices, RISK_NOTES, termsFor } from '../xingfu-plan/calculate.mjs';
import { Spreadsheet, SheetError, columnNumber } from './spreadsheet.mjs';

export const SUITE_PRODUCTS = {
  xingfu: { title: '泰康幸福享裕保险产品计划', short: '幸福享裕', version: '26.07', account: [1, 3], initial: { age: 16, sex: 'M', term: 3, premium: 1000000, rate: 3, dividend: 100, receive: 0 } },
  'changle-vip': {
    title: '泰康长乐金生（尊享版）保险产品计划', short: '长乐金生（尊享版）', version: '26.10', account: [1, 4],
    sheet: '计划及演示页', detail: '完整利益演示', first: 6, detailFirst: 18, end: 'R', notes: 'B2',
    controls: { sex: 'B4', age: 'E4', premium: 'F4', term: 'I4', dividend: 'L4', rate: 'N4' },
    initial: { age: 2, sex: 'M', term: 1, premium: 1200000, rate: 3, dividend: 100 },
    year: 'B', age: 'D', endAge: 'C', annuity: 'I', defaults: 'B C E G I K M N',
    withdrawals: [{ cell: 'L', label: '万能账户部分领取' }],
  },
  'suixiang-vip': {
    title: '泰康岁享福（至尊版）终身寿险（分红型）', short: '岁享福（至尊版）', version: '26.10', life: true,
    sheet: '计划书', detail: '利益演示', first: 6, detailFirst: 17, end: 'Q', notes: 'B2',
    controls: { sex: 'B4', age: 'C4', premium: 'E4', term: 'G4', dividend: 'M4' },
    initial: { age: 40, sex: 'F', term: 5, premium: 300000, dividend: 100 },
    year: 'B', age: 'D', endAge: 'C', defaults: 'B C E G H I M N',
    withdrawals: [{ cell: 'J', label: '基础现价领取', limit: 'S' }, { cell: 'K', label: '红利现价领取', limit: 'U' }],
    withdrawalNote: '基础现价领取以原表当年限额为准，红利现价领取以当年可领取的红利现价为限。',
  },
  'zhenpin-e': {
    title: '泰康臻品世家 E 保险产品计划', short: '臻品世家 E', version: '26.07', account: [0, 6], startChoices: true,
    sheet: '利益演算', detail: '利益演示', first: 8, detailFirst: 18, end: 'P', notes: 'C3',
    controls: { sex: 'C5', age: 'D5', premium: 'F5', term: 'H5', dividend: 'J5', rate: 'K5', start: 'M5' },
    initial: { age: 40, sex: 'M', term: 3, premium: 1000000, rate: 3, dividend: 100, start: 60 },
    year: 'C', age: 'E', endAge: 'D', annuity: 'H', defaults: 'C D F H I J L M',
    withdrawals: [{ cell: 'K', label: '万能账户部分领取' }],
    withdrawalNote: '原表提示，万能账户退休前领取不得超过已产生年金及分红累计的 20%。',
  },
  changle: {
    title: '泰康长乐金生保险产品计划', short: '长乐金生', version: '26.07', account: [0, 6],
    sheet: '产品计划演示', detail: '利益总表-不要动', first: 8, detailFirst: 18, end: 'P', notes: 'B3',
    controls: { sex: 'B5', age: 'C5', premium: 'G5', term: 'E5', dividend: 'I5', rate: 'K5' },
    initial: { age: 40, sex: 'F', term: 3, premium: 200000, rate: 3, dividend: 100 },
    year: 'B', age: 'D', endAge: 'C', annuity: 'I', defaults: 'B C E H I J L M',
    withdrawals: [{ cell: 'K', label: '万能账户部分领取' }],
  },
  suixiang: {
    title: '泰康岁享福终身寿险（分红型）', short: '岁享福增额寿', version: '26.07', life: true,
    sheet: '演示页', detail: '利益演示', first: 6, detailFirst: 17, end: 'Q', notes: 'B4',
    controls: { sex: 'B3', age: 'C3', premium: 'F3', term: 'H3', dividend: 'N3' },
    initial: { age: 52, sex: 'M', term: 3, premium: 3600000, dividend: 100 },
    year: 'B', age: 'C', endAge: 'D', defaults: 'B D E G H I L Q',
    withdrawals: [{ cell: 'J', label: '部分领取（分红现价）', limit: 'U' }],
    withdrawalNote: '按原演示页规则，本版本在分红现价范围内设计部分领取。',
  },
};

export function startLabel(age) {
  return age === 1 ? '生效后的首个年生效对应日' : `${age}岁后的首个年生效对应日`;
}

function sourceCell(model, sheet, address) {
  const [, col, row] = /^([A-Z]+)(\d+)$/.exec(address);
  return model.sheets[sheet].rows[Number(row) - 1]?.[columnNumber(col)] ?? null;
}

const cleanHeader = text => text.replace(/[\r\n]+/g, ' ').trim();

export function suiteColumns(id, model) {
  if (id === 'xingfu') return COLUMNS;
  const product = SUITE_PRODUCTS[id];
  const headers = model.sheets[product.sheet].rows[product.first - 2];
  return headers.slice(0, columnNumber(product.end) + 1).flatMap((label, index) => {
    if (typeof label !== 'string' || !label.trim() || label.includes('算IRR用')) return [];
    const key = String.fromCharCode(65 + index);
    const kind = [product.year, product.age, product.endAge].includes(key) ? 'integer'
      : /比例|增长率|单利|irr/i.test(label) ? 'percent' : undefined;
    const group = kind === 'integer' || /保费/.test(label) ? '基础信息'
      : /领取|红利|分红|年金|现价|现金价值/.test(label) ? '保单利益与领取' : '账户与总利益';
    return [{ key, label: cleanHeader(label), kind, group }];
  });
}

const eligibilityCache = new WeakMap();

export function suiteCases(id, model) {
  if (eligibilityCache.has(model)) return eligibilityCache.get(model);
  const product = SUITE_PRODUCTS[id];
  const rows = product.life ? model.sheets['基本保额对应部分'].rows : model.sheets['基础数据'].rows;
  const cases = new Map();
  for (const row of rows) {
    if (row[5] !== 1 || !(row[7] > 0) || !Number.isInteger(row[4])) continue;
    const [term, code, age] = row.slice(2, 5);
    const sex = code === '男' ? 'M' : code === '女' ? 'F' : code;
    const start = product.startChoices ? row[1] : 0;
    if (!['M', 'F'].includes(sex)) continue;
    if (!cases.has(`${age}${sex}`)) cases.set(`${age}${sex}`, new Map());
    const terms = cases.get(`${age}${sex}`);
    if (!terms.has(term)) terms.set(term, new Set());
    terms.get(term).add(start);
  }
  eligibilityCache.set(model, cases);
  return cases;
}

export function suiteChoices(id, model, age, sex, term) {
  if (id === 'xingfu') return { terms: termsFor(model, age, sex), starts: payoutChoices(model, age, sex, term) };
  const terms = suiteCases(id, model).get(`${age}${sex}`) ?? new Map();
  return { terms: [...terms.keys()].sort((a, b) => a - b), starts: [...(terms.get(term) ?? [])].filter(Boolean).sort((a, b) => a - b) };
}

function planValue(engine, sheet, row, column) {
  try {
    const value = engine.cell(sheet, row - 1, columnNumber(column));
    return value === '' || value === '-' ? null : value;
  } catch (error) {
    if (!(error instanceof SheetError)) throw error;
    return null;
  }
}

function validateWithdrawals(withdrawals, product) {
  const used = new Set();
  return (withdrawals ?? []).filter(({ amount }) => amount !== 0).map(({ year, cell, amount }) => {
    const key = `${cell}${year}`;
    if (!Number.isInteger(year) || year < 1 || year > 106 || !product.withdrawals.some(item => item.cell === cell) ||
        !(amount > 0) || !Number.isSafeInteger(Math.round(amount * 100)) || used.has(key)) {
      throw new Error('请检查部分领取的保单年度、项目和金额。同一年度的同一项目只能填一次。');
    }
    used.add(key);
    return { year, cell, amount };
  });
}

export function calculateSuite(id, model, input, columns = suiteColumns(id, model)) {
  if (id === 'xingfu') return calculate(model, input);
  const product = SUITE_PRODUCTS[id];
  const { age, sex, term, premium, rate, dividend, start } = input;
  const { terms, starts } = suiteChoices(id, model, age, sex, term);
  if (!terms.includes(term) || product.startChoices && !starts.includes(start)) {
    throw new Error('请选择原表支持的年龄、性别、缴费期间和领取方式。');
  }
  if (!(premium > 0) || !Number.isSafeInteger(Math.round(premium * 100))) throw new Error('请填写有效的首期保费。');
  if (!Number.isFinite(dividend) || dividend < 0) throw new Error('请填写有效的分红演示水平。');
  if (product.account && (!Number.isFinite(rate) || rate < product.account[0] || rate > product.account[1])) {
    throw new Error(`万能账户演示利率请输入 ${product.account[0]}% 至 ${product.account[1]}%。`);
  }
  const withdrawals = validateWithdrawals(input.withdrawals, product);
  const edits = {};
  for (const [key, address] of Object.entries(product.controls)) {
    edits[address] = key === 'sex' ? (sex === 'M' ? '男' : '女') : key === 'start' ? startLabel(start)
      : key === 'dividend' || key === 'rate' ? input[key] / 100 : input[key];
  }
  for (const { cell } of product.withdrawals) {
    for (let row = product.first; row < product.first + 106; row++) edits[`${cell}${row}`] = 0;
  }
  for (const { year, cell, amount } of withdrawals) edits[`${cell}${product.first + year - 1}`] = amount;
  const engine = new Spreadsheet(model, { [product.sheet]: edits });
  const rows = [];
  for (let row = product.first; row < product.first + 106; row++) {
    const year = planValue(engine, product.sheet, row, product.year);
    if (!(year > 0)) break;
    const values = Object.fromEntries(columns.map(({ key }) => [key, planValue(engine, product.sheet, row, key)]));
    rows.push({ ...values, year, age: planValue(engine, product.sheet, row, product.age),
      endAge: planValue(engine, product.sheet, row, product.endAge), annuity: product.annuity ? values[product.annuity] : 0 });
  }
  if (!rows.length) throw new Error('这组条件没有可生成的演算结果。');
  for (const item of withdrawals) {
    const config = product.withdrawals.find(rule => rule.cell === item.cell);
    const row = product.detailFirst + item.year - 1;
    const limit = config.limit ? planValue(engine, product.detail, row, config.limit) : undefined;
    const account = product.life ? undefined : planValue(engine, product.detail, row, 'Y');
    if (item.year > rows.length || config.limit && (!(limit >= 0) || item.amount > limit + 1e-7) ||
        !product.life && (typeof account !== 'number' || account < 0)) {
      throw new Error(`第 ${item.year} 年的「${config.label}」超过原表可演算范围。${typeof limit === 'number' ? `该项上限为 ${formatValue(limit)} 元。` : ''}`);
    }
  }
  const assumptions = [`分红演示水平 ${dividend}%`];
  if (product.account) assumptions.unshift(`账户演示利率 ${rate}%`);
  if (product.startChoices) assumptions.push(startLabel(start));
  return { input, rows, totalPremium: premium * term, productTitle: product.title, shortTitle: product.short,
    version: product.version, assumptions: assumptions.join('　'), notes: sourceCell(model, product.sheet, product.notes),
    pdfNotes: product.account ? RISK_NOTES : RISK_NOTES.slice(0, 2) };
}
