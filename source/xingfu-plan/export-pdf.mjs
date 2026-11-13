import { plannedWithdrawalYears } from './calculate.mjs';

export function planHeadline(plan) {
  const { age, sex, premium, term } = plan.input;
  const amount = premium % 10000 === 0 ? `${premium / 10000}万元` : `${formatValue(premium)}元`;
  return `${age}岁${sex === 'M' ? '男' : '女'}　${term === 1 ? '趸交' : '每年'}${amount}${term === 1 ? '' : `　${termLabel(term)}`}`;
}

export function planPdfFilename(plan) {
  const { age, sex, term, receive } = plan.input;
  const receiveSuffix = plan.factor ? `_${receive}岁领取` : '';
  return `${plan.shortTitle ?? '幸福享裕'}_${age}岁${sex === 'M' ? '男' : '女'}_${termLabel(term)}${receiveSuffix}_逐年.pdf`;
}

function fit(ctx, text, width, size, minimum = 10) {
  const family = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  do { ctx.font = `${size}px ${family}`; if (ctx.measureText(text).width <= width) break; } while (--size >= minimum);
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const char of text) {
    if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = char; }
    else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

export const EMPTY_PDF_COLUMNS = '所选项目没有可展示的数据，请在「展示项目」里选择其他列。';

function pdfCell(row, column) {
  const value = row[column.key];
  if (typeof value === 'string') return /^[\s—–-]*$/.test(value) ? '' : value.trim();
  return Number.isFinite(value) && (value !== 0 || column.kind === 'integer')
    ? formatValue(value, column.kind) : '';
}

export function visiblePdfColumns(columns, rows) {
  return columns.filter(column => rows.some(row => pdfCell(row, column) !== ''));
}

function pdfPageLayout(columnCount) {
  if (columnCount > 12) return { width: 1588, height: 1123, pageSize: [1190.55, 841.89] };
  if (columnCount > 9) return { width: 1123, height: 794, pageSize: [841.89, 595.28] };
  return { width: 794, height: 1123, pageSize: [595.28, 841.89] };
}

function pdfColumnWidths(ctx, columns, values, gridWidth) {
  fit(ctx, '', gridWidth, 12);
  const desired = columns.map((column, i) => {
    const baseline = column.kind === 'integer' ? 48 : 64;
    return Math.max(baseline, ...values.map(row => ctx.measureText(row[i]).width + 12));
  });
  const desiredWidth = desired.reduce((sum, width) => sum + width, 0);
  return desired.map(width => width / desiredWidth * gridWidth);
}

export async function drawPlanPages(plan, columns, rows, createPage) {
  const title = plan.productTitle ?? PRODUCT;
  const { width, height, pageSize } = pdfPageLayout(columns.length);
  const left = 34;
  const gridWidth = width - 2 * left;
  const tableTop = plan.factor ? 167 : 146;
  const headerHeight = 48;
  const rowHeight = 18;
  const capacity = Math.floor((height - 96 - tableTop - headerHeight) / rowHeight);
  const pageCount = Math.ceil(rows.length / capacity);
  const rowsPerPage = Math.ceil(rows.length / pageCount);
  const values = rows.map(row => columns.map(column => pdfCell(row, column)));
  const firstAnnuity = plan.rows.find(row => row.annuity > 0)?.year;
  const withdrawalYears = plannedWithdrawalYears(plan.input);
  let pageNumber = 0;

  for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
    const { ctx, finish } = createPage(width, height, pageSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#783d35';
    ctx.fillRect(left, 29, 33, 4);
    fit(ctx, title, gridWidth, 29);
    ctx.fillText(title, left, 56);
    ctx.fillStyle = '#726763';
    const subtitle = `利益演示试用版　数据版本 ${plan.version ?? '26.07'}　金额单位 元`;
    fit(ctx, subtitle, gridWidth, 12);
    ctx.fillText(subtitle, left, 83);

    ctx.fillStyle = '#f6eee9';
    ctx.fillRect(left, 99, gridWidth, plan.factor ? 61 : 40);
    ctx.fillStyle = '#50322e';
    const summary = `${planHeadline(plan)}　总保费 ${formatValue(plan.totalPremium)} 元`;
    fit(ctx, summary, gridWidth - 24, 15);
    ctx.fillText(summary, left + 12, 112);
    const assumptions = plan.assumptions ?? `账户演示利率 ${plan.input.rate}%　分红演示水平 ${plan.input.dividend}%${plan.factor ? `　一次性领取 ${plan.input.receive}岁` : ''}`;
    fit(ctx, assumptions, gridWidth - 24, 12);
    ctx.fillText(assumptions, left + 12, 129);
    if (plan.factor) {
      const payout = `一次性领取演示金额 ${formatValue(plan.lumpAmount)} 元　基本保险金额 × ${plan.factor} 倍`;
      fit(ctx, payout, gridWidth - 24, 12);
      ctx.fillText(payout, left + 12, 148);
    }

    const widths = pdfColumnWidths(ctx, columns, values, gridWidth);
    ctx.fillStyle = '#603932';
    ctx.fillRect(left, tableTop, gridWidth, headerHeight);
    let x = left;
    for (const [i, column] of columns.entries()) {
      ctx.fillStyle = '#ffffff';
      fit(ctx, '', widths[i], 12);
      const lines = wrap(ctx, column.label, widths[i] - 8);
      ctx.textAlign = 'center';
      lines.forEach((line, j) => ctx.fillText(line, x + widths[i] / 2, tableTop + headerHeight / 2 + (j - (lines.length - 1) / 2) * 13));
      x += widths[i];
    }
    const batch = rows.slice(offset, offset + rowsPerPage);
    for (const [i, row] of batch.entries()) {
      const y = tableTop + headerHeight + i * rowHeight;
      const highlight = row.lumpSum > 0 || row.year === firstAnnuity || withdrawalYears.has(row.year);
      ctx.fillStyle = highlight ? '#f3e4d6' : i % 2 ? '#fbf9f7' : '#ffffff';
      ctx.fillRect(left, y, gridWidth, rowHeight);
      x = left;
      for (const [j, column] of columns.entries()) {
        const value = values[offset + i][j];
        if (!value) {
          x += widths[j];
          continue;
        }
        ctx.fillStyle = ['survival','lumpSum'].includes(column.key) ? '#783d35' : '#272421';
        ctx.textAlign = column.kind === 'integer' ? 'center' : 'right';
        fit(ctx, value, widths[j] - 8, 12, 8);
        ctx.fillText(value, column.kind === 'integer' ? x + widths[j] / 2 : x + widths[j] - 5, y + rowHeight / 2);
        x += widths[j];
      }
    }
    ctx.strokeStyle = '#e4dad5';
    const bottom = tableTop + headerHeight + batch.length * rowHeight;
    ctx.drawRule(left, width - left, bottom);
    ctx.fillStyle = '#675a54';
    ctx.textAlign = 'left';
    let noteY = height - 75;
    for (const note of plan.pdfNotes ?? RISK_NOTES) {
      fit(ctx, '', gridWidth, 11);
      for (const line of wrap(ctx, note, gridWidth)) { ctx.fillText(line, left, noteY); noteY += 13; }
    }
    ctx.textAlign = 'right';
    ctx.fillText(`${++pageNumber} / ${pageCount}`, width - left, height - 23);

    await finish();
  }
}

export async function exportPlanPdf(plan, columns, rows) {
  const pdf = await globalThis.PDFLib.PDFDocument.create();
  pdf.setTitle(`${plan.productTitle ?? PRODUCT} 利益演示`);
  await drawPlanPages(plan, columns, rows, (width, height, pageSize) => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.textBaseline = 'middle';
    ctx.drawRule = (from, to, y) => {
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.stroke();
    };
    return { ctx, async finish() {
      const image = await pdf.embedJpg(canvas.toDataURL('image/jpeg', 0.95));
      const page = pdf.addPage(pageSize);
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    } };
  });
  return pdf.save();
}
