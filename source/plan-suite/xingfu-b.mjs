import { annualizedReturn, caseFor, COLUMNS, formatValue, normalizePlanInput } from '../xingfu-plan/calculate.mjs';

const bLabels = {
  year: '保单年度', age: '年初年龄', endAge: '年末年龄', premium: '当年保费',
  dividend: '当年转入红利', yearEndDividend: '当年红利', cash: '主险现金价值',
  accountCash: '万能现金价值', survival: '退保总利益', death: '身故总利益',
  simpleRate: '年化单利', irr: '复合收益率',
};
export const XINGFU_B_COLUMNS = COLUMNS.filter(({ key }) => key !== 'mainDeath').map(column => ({
  ...column, label: bLabels[column.key] ?? column.label,
}));

export function calculateXingfuB(data, input, withdrawals) {
  const { age, sex, term, premium, rate, dividend, receive } = normalizePlanInput(input);
  const selected = caseFor(data, age, sex, term);
  if (!selected) throw new Error('请选择有效的投保年龄、性别和缴费期间。');
  if (!(premium > 0) || !Number.isSafeInteger(Math.round(premium * 100))) throw new Error('请输入有效的首年保费。');
  if (rate < 1 || rate > 3) throw new Error('账户演示利率请输入 1% 至 3%。');
  if (dividend < 0) throw new Error('请输入有效的分红演示水平。');
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
  let previousDividend = 0;
  let previousAccount = 0;
  let initialTransfers = 0;
  const payments = [];
  const rows = sourceRows.map(([sourcePremium, sourceDividend, sourceAnnuity, sourceDeath, sourceCash], index) => {
    const year = index + 1;
    const startAge = age + index;
    const endAge = startAge + 1;
    const ended = receive > 0 && startAge >= receive;
    const payment = sourcePremium * scale;
    const annuity = ended ? 0 : sourceAnnuity * scale;
    const lumpSum = receive && startAge === receive ? lumpAmount : 0;
    const yearEndDividend = ended ? 0 : sourceDividend * scale * dividend / 100;
    const cash = ended ? 0 : sourceCash * scale;
    const transfer = annuity + lumpSum + previousDividend;
    if (year <= 6) initialTransfers += transfer;
    const bonus = year < 6 ? 0 : (year === 6 ? initialTransfers : transfer) * data.transferFee;
    // 26.11 «利益演示» Y 列在当年扣除 V 列领取；L 列输入校验使用扣减前的余额。
    const beforeWithdrawal = (previousAccount + transfer - transfer * data.transferFee) * (1 + rate / 100) + bonus;
    const withdrawal = withdrawalByYear.get(year) ?? 0;
    const limit = beforeWithdrawal * (endAge < (sex === 'M' ? 60 : 55) ? 0.2 : 1);
    if (withdrawal > limit + 1e-7) {
      throw new Error(`第 ${year} 年的部分领取金额超过原表可演算上限（${limit.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元）。`);
    }
    const account = Math.max(0, beforeWithdrawal - withdrawal);
    const accountCash = account * (1 - data.surrenderFees[Math.min(index, data.surrenderFees.length - 1)]);
    const nextBenefit = ended ? 0 : receive === endAge ? basic : (sourceRows[index + 1]?.[2] ?? 0) * scale;
    const survival = cash + accountCash + yearEndDividend + nextBenefit;
    paid += payment;
    payments.push(payment);
    const simpleDenominator = premium * (year * term - term * (term - 1) / 2);
    const row = {
      year, age: startAge, endAge, premium: payment, paid, annuity, lumpSum,
      dividend: previousDividend, yearEndDividend, cash, transfer, bonus, withdrawal, account, accountCash, survival,
      death: account + yearEndDividend + (ended ? 0 : sourceDeath * scale),
      simpleRate: survival >= paid && simpleDenominator ? (survival - paid) / simpleDenominator : null,
      irr: survival > paid ? annualizedReturn(payments, survival) : null,
    };
    previousDividend = yearEndDividend;
    previousAccount = account;
    return row;
  });
  if (!rows.every(row => Object.values(row).every(value => value === null || Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER))) {
    throw new Error('这组输入超出了网页可演算的数值范围。');
  }
  return { input, rows, basic, factor, lumpAmount, totalPremium: paid };
}
