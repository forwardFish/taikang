export const PRODUCT = '泰康幸福享裕保险产品计划';
export const RISK_NOTES = [
  '红利演示基于精算及其他假设，保单的红利分配不确定。',
  '现金价值及各项给付条件以保险条款为准。',
  '万能账户最低保证利率之上的投资收益不确定。完整利益演示以泰行销生成版本为准。',
];

export const COLUMNS = [
  { key: 'year', label: '年度', group: '基础信息', kind: 'integer' },
  { key: 'age', label: '年龄（年初）', group: '基础信息', kind: 'integer' },
  { key: 'endAge', label: '年龄（年末）', group: '基础信息', kind: 'integer' },
  { key: 'premium', label: '年缴保费', group: '基础信息' },
  { key: 'paid', label: '累计保费', group: '基础信息' },
  { key: 'annuity', label: '当年年金', group: '主险与领取' },
  { key: 'lumpSum', label: '一次性领取', group: '主险与领取' },
  { key: 'dividend', label: '当年转入红利', group: '主险与领取' },
  { key: 'yearEndDividend', label: '年末演示红利', group: '主险与领取' },
  { key: 'cash', label: '主险年末现金价值', group: '主险与领取' },
  { key: 'mainDeath', label: '主险身故给付合计', group: '主险与领取' },
  { key: 'transfer', label: '转入万能账户', group: '万能账户与总利益' },
  { key: 'bonus', label: '持续奖金', group: '万能账户与总利益' },
  { key: 'withdrawal', label: '部分领取', group: '万能账户与总利益', kind: 'withdrawal' },
  { key: 'account', label: '万能账户价值', group: '万能账户与总利益' },
  { key: 'accountCash', label: '万能账户现金价值', group: '万能账户与总利益' },
  { key: 'survival', label: '预期生存总利益', group: '万能账户与总利益' },
  { key: 'death', label: '预期身故总利益', group: '万能账户与总利益' },
  { key: 'simpleRate', label: '预期年化单利', group: '万能账户与总利益', kind: 'percent' },
  { key: 'irr', label: '预期年化复利（IRR）', group: '万能账户与总利益', kind: 'percent' },
];

export const DEFAULT_COLUMNS = ['year','age','premium','annuity','dividend','account','survival'];
export const SAMPLE = { age: 16, sex: 'M', term: 3, premium: 1000000, rate: 3, dividend: 100, receive: 0 };

export function normalizePlanInput(value) {
  const { age, sex, term, premium, rate, dividend, receive } = value ?? {};
  if (!Number.isInteger(age) || !Number.isInteger(term) || !['M', 'F'].includes(sex) ||
      !Number.isFinite(premium) || !Number.isFinite(rate) || !Number.isFinite(dividend) ||
      ![0, 60, 70, 80].includes(receive)) {
    throw new Error('请检查投保年龄、缴费期间、保费和演示参数。');
  }
  return { age, sex, term, premium, rate, dividend, receive };
}

export function termLabel(term) {
  return term === 1 ? '趸交' : `${term}年交`;
}

export function caseFor(data, age, sex, term) {
  return data.cases[`${age}${sex}${term}`];
}

export function termsFor(data, age, sex) {
  return Object.keys(data.terms).map(Number).filter(term => caseFor(data, age, sex, term));
}

export function payoutChoices(data, age, sex, term) {
  const selected = caseFor(data, age, sex, term);
  return selected ? Object.keys(selected[1]).map(Number) : [];
}

export function annualizedReturn(premiums, benefit) {
  if (!(benefit > 0)) return null;
  const balance = rate => premiums.reduce(
    (value, premium, i) => value - premium * (1 + rate) ** (premiums.length - i), benefit,
  );
  let low = -1;
  let high = 1;
  while (balance(high) > 0 && high < 1000000) high *= 2;
  for (let i = 0; i < 54; i++) {
    const mid = (low + high) / 2;
    if (balance(mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function calculate(data, input) {
  const { age, sex, term, premium, rate, dividend, receive, withdrawals = [] } = input;
  const selected = caseFor(data, age, sex, term);
  if (!selected) throw new Error('请选择有效的投保年龄、性别和缴费期间。');
  if (!(premium > 0) || !Number.isSafeInteger(Math.round(premium * 100))) throw new Error('请输入有效的首年保费。');
  if (!Number.isFinite(rate) || rate < 1 || rate > 3) throw new Error('账户演示利率请输入 1% 至 3%。');
  if (!Number.isFinite(dividend) || dividend < 0) throw new Error('请输入有效的分红演示水平。');
  const [basicRate, factors, sourceRows] = selected;
  if (receive && !factors[receive]) throw new Error('这个投保组合没有所选领取年龄，请重新选择。');
  for (const { year } of withdrawals) {
    if (year > sourceRows.length) throw new Error(`第 ${year} 年超出本方案的演算年度。`);
  }
  const withdrawalByYear = new Map(withdrawals.map(({ year, amount }) => [year, amount]));

  const basic = basicRate * premium / 1000;
  const factor = receive ? factors[receive] : 0;
  const lumpAmount = basic * factor;
  const scale = premium / 10000;
  let paid = 0;
  let paidYears = 0;
  let previousDividend = 0;
  let previousAccount = 0;
  let initialTransfers = 0;
  const payments = [];
  const rows = sourceRows.map(([sourcePremium, , sourceDividend, sourceAnnuity, guaranteeDeath, death, cash], index) => {
    const year = index + 1;
    const startAge = age + index;
    const ended = Boolean(receive && startAge >= receive);
    const payment = sourcePremium * scale;
    const annuity = ended ? 0 : sourceAnnuity * scale;
    const lumpSum = startAge === receive && receive ? lumpAmount : 0;
    const yearEndDividend = ended ? 0 : sourceDividend * scale * dividend / 100;
    const mainCash = ended ? 0 : cash * scale;
    const mainDeath = ended ? 0 : (death + guaranteeDeath) * scale;
    const transfer = annuity + lumpSum + previousDividend;
    if (year <= 6) initialTransfers += transfer;
    const bonus = year < 6 ? 0 : (year === 6 ? initialTransfers : transfer) * data.transferFee;
    // 原表当年展示领取金额，下一年度万能账户公式扣减上一年度领取。
    const priorWithdrawal = withdrawalByYear.get(year - 1) ?? 0;
    const withdrawal = withdrawalByYear.get(year) ?? 0;
    const account = (previousAccount + transfer - transfer * data.transferFee) * (1 + rate / 100) + bonus - priorWithdrawal;
    if (withdrawal > account + 1e-7) {
      throw new Error(`第 ${year} 年的部分领取金额超过万能账户价值（${formatValue(account)} 元）。`);
    }
    const fee = data.surrenderFees[Math.min(index, data.surrenderFees.length - 1)];
    const accountCash = account * (1 - fee);
    paid += payment;
    paidYears += paid;
    payments.push(payment);

    // 原表 AI 列在一次性领取前一年度使用基本保险金额，其他适用年份取下一年度的年金。
    let nextBenefit = 0;
    if (receive && startAge === receive - 1) nextBenefit = basic;
    else if (!ended && startAge + 1 < Math.max(age, 60) + 25) {
      nextBenefit = (sourceRows[index + 1]?.[3] || 0) * scale;
    }
    const survival = mainCash + accountCash + yearEndDividend + nextBenefit;
    const row = {
      year, age: startAge, endAge: startAge + 1, premium: payment, paid,
      annuity, lumpSum, dividend: previousDividend, yearEndDividend,
      cash: mainCash, mainDeath, transfer, bonus, withdrawal, account, accountCash, survival,
      death: account + yearEndDividend + mainDeath,
      simpleRate: (survival - paid) / paidYears,
      irr: annualizedReturn(payments, survival),
    };
    previousDividend = yearEndDividend;
    previousAccount = account;
    return row;
  });
  if (!rows.every(row => Object.values(row).every(value => value === null || Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER))) {
    throw new Error('这组输入超出了网页可演算的数值范围。');
  }
  return { input: { ...input }, rows, basic, factor, lumpAmount, totalPremium: paid };
}

export function formatValue(value, kind) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (kind === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (kind === 'integer') return String(value);
  if (kind === 'withdrawal') return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  return Math.round(value).toLocaleString('zh-CN');
}

export function plannedWithdrawalYears(input) {
  const years = new Set(input.withdrawals?.filter(item => item.amount > 0).map(item => item.year));
  for (const { from, to } of input.withdrawalStages ?? []) {
    for (let year = from; year <= to; year++) years.add(year);
  }
  return years;
}
