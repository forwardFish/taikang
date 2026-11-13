export const DEMO_INPUT = { age: 40, sex: 'M', term: 3, premium: 100000, rate: 3, dividend: 100, start: 60, receive: 0 };
const demoNotice = '模拟费率和虚构投保参数，仅供个人非商业功能验证。';

export function demoChoices(product, age, term) {
  const terms = age >= 0 && age <= 75 ? [1, 3, 5, 10].filter(years => age + years <= 80) : [];
  const offered = product === 'xingfu' ? [60, 70, 80] : product === 'zhenpin-e' ? [1, 55, 60, 65] : [];
  const starts = terms.includes(term) ? offered.filter(start => start === 1 || start >= age + term + 3) : [];
  return { terms, starts };
}

function demoColumn({ key, label, kind }, values) {
  if (Object.hasOwn(values, key)) return values[key];
  const field = label.replace(/\s/g, '');
  if (/年度$/.test(field)) return values.year;
  if (/年龄/.test(field)) return /年初/.test(field) ? values.age : values.endAge;
  if (kind === 'percent') {
    if (/红利比例/.test(field)) return values.dividend / values.paid;
    if (/年金比例/.test(field)) return values.annuity / values.paid;
    return values.simpleRate;
  }
  if (/累计保费/.test(field)) return values.paid;
  if (/保费/.test(field)) return values.premium;
  if (/累计领取|累计规划/.test(field)) return values.cumulative;
  if (/红利现价领取/.test(field)) return values.dividendWithdrawal;
  if (/基础现价领取|部分领取/.test(field)) return values.withdrawal;
  if (/身故|传承/.test(field)) return values.death;
  if (/保证生存/.test(field)) return values.cash;
  if (/生存总利益|退保总利益/.test(field)) return values.survival;
  if (/年金/.test(field)) return values.annuity;
  if (/万能账户/.test(field)) return values.account;
  if (/分红现价|分红累计/.test(field)) return values.dividendCash;
  if (/红利|分红/.test(field)) return values.dividend;
  return values.cash;
}

function suitePlan({ product, input, columns: keys }, wantsPdf) {
  if (!Object.hasOwn(suiteModelData, product) || !input) throw new Error('请选择产品版本并填写投保信息。');
  const config = SUITE_PRODUCTS[product];
  const { age, sex, term, premium, rate, dividend, start, receive, withdrawals = [] } = input;
  const choices = demoChoices(product, age, term);
  const selectedStart = product === 'xingfu' ? receive : start;
  if (!Number.isInteger(age) || !choices.terms.includes(term) || !['M', 'F'].includes(sex) ||
      !Number.isFinite(premium) || premium <= 0 || premium > 100000000 || !Number.isFinite(dividend) || dividend < 0 ||
      config.account && (!Number.isFinite(rate) || rate < config.account[0] || rate > config.account[1]) ||
      (config.startChoices || product === 'xingfu' && receive) && !choices.starts.includes(selectedStart)) {
    throw new Error('请检查演示年龄、缴费期间、金额和领取设置。');
  }
  if (!Array.isArray(withdrawals) || withdrawals.length > 212 || withdrawals.some(item => !item ||
      !Number.isInteger(item.year) || item.year < 1 || item.year > 105 - age ||
      !Number.isFinite(item.amount) || item.amount < 0 || !config.withdrawals?.some(rule => rule.cell === item.cell))) {
    throw new Error('请检查模拟领取项目和金额。');
  }
  const all = suiteModelData[product];
  if (wantsPdf && (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length ||
      keys.some(key => !all.some(column => column.key === key)))) throw new Error('请选择有效的展示项目。');

  const rows = [];
  let account = 0;
  let dividendCash = 0;
  let cumulative = 0;
  const lumpAmount = product === 'xingfu' && receive ? premium * 0.2 : 0;
  for (let year = 1; year <= 105 - age; year++) {
    const endAge = age + year;
    const paid = premium * Math.min(year, term);
    const annualDividend = paid * 0.006 * (dividend / 100);
    const annuityStart = config.startChoices ? (start === 1 ? age + 1 : start) : age + term + 2;
    const annuity = !config.life && endAge >= annuityStart ? premium * 0.015 : 0;
    const lumpSum = endAge === receive ? lumpAmount : 0;
    const thisYear = withdrawals.filter(item => item.year === year);
    const dividendWithdrawal = thisYear.filter(item => item.cell === 'K' && product === 'suixiang-vip').reduce((total, item) => total + item.amount, 0);
    const withdrawal = thisYear.reduce((total, item) => total + item.amount, 0) - dividendWithdrawal;
    cumulative += withdrawal + dividendWithdrawal + lumpSum;
    dividendCash = Math.max(0, dividendCash + annualDividend - dividendWithdrawal);
    const transfer = config.account ? annuity + annualDividend : 0;
    account = Math.max(0, account * (1 + (rate || 0) / 100) + transfer - withdrawal);
    const cash = Math.max(0, paid * Math.min(1.3, 0.55 + year * 0.045) - (config.life ? cumulative : 0));
    const survival = cash + (config.account ? account : dividendCash);
    const death = Math.max(paid, cash) + (config.account ? account : dividendCash);
    const simpleRate = (survival + cumulative - paid) / paid / year;
    const values = { year, age: endAge - 1, endAge, premium: year <= term ? premium : 0, paid, annuity, lumpSum,
      dividend: annualDividend, yearEndDividend: annualDividend, cash, mainDeath: Math.max(paid, cash), transfer, bonus: 0,
      account, accountCash: account, survival, death, simpleRate, irr: simpleRate, cumulative, dividendCash, withdrawal, dividendWithdrawal };
    rows.push({ ...values, ...Object.fromEntries(all.map(column => [column.key, demoColumn(column, values)])) });
  }
  const plan = { input: { age, sex, term, premium, rate, dividend, start, receive, withdrawals }, rows, factor: lumpAmount ? 1 : 0,
    lumpAmount, totalPremium: premium * term, productTitle: `${config.title} · 模拟版`, shortTitle: `${config.short}模拟版`,
    version: '模拟数据', assumptions: demoNotice, notes: demoNotice, pdfNotes: [demoNotice, '模拟金额不用于实际投保、收益比较或客户说明。'] };
  return { plan, columns: wantsPdf ? all.filter(column => keys.includes(column.key)) : all };
}
