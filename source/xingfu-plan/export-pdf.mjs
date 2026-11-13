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

function pageGroups(columns) {
  if (columns.length <= 12) return [columns];
  const [first, ...others] = columns;
  const groups = [];
  for (let i = 0; i < others.length; i += 11) groups.push([first, ...others.slice(i, i + 11)]);
  return groups;
}

export async function drawPlanPages(plan, columns, rows, createPage) {
  const title = plan.productTitle ?? PRODUCT;
  const groups = pageGroups(columns);
  const wide = columns.length > 9;
  const width = wide ? 1123 : 794;
  const height = wide ? 794 : 1123;
  const left = 34;
  const gridWidth = width - 2 * left;
  const tableTop = plan.factor ? 167 : 146;
  const headerHeight = 40;
  const rowHeight = 18;
  const capacity = Math.floor((height - 96 - tableTop - headerHeight) / rowHeight);
  const pagesPerGroup = Math.ceil(rows.length / capacity);
  const rowsPerPage = Math.ceil(rows.length / pagesPerGroup);
  const pageCount = groups.length * pagesPerGroup;
  let pageNumber = 0;

  for (const [groupIndex, group] of groups.entries()) {
    for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
      const { ctx, finish } = createPage(width, height, wide);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#783d35';
      ctx.fillRect(left, 29, 33, 4);
      fit(ctx, title, gridWidth, 29);
      ctx.fillText(title, left, 56);
      ctx.fillStyle = '#726763';
      const subtitle = `利益演示试用版　数据版本 ${plan.version ?? '26.07'}　金额单位 元${groups.length > 1 ? `　展示分组 ${groupIndex + 1}/${groups.length}` : ''}`;
      fit(ctx, subtitle, gridWidth, 12);
      ctx.fillText(subtitle, left, 83);

      ctx.fillStyle = '#f6eee9';
      ctx.fillRect(left, 99, gridWidth, plan.factor ? 61 : 40);
      ctx.fillStyle = '#50322e';
      const summary = `${planHeadline(plan)}　总保费 ${formatValue(plan.totalPremium)} 元`;
      fit(ctx, summary, gridWidth - 24, 15);
      ctx.fillText(summary, left + 12, 112);
      const assumptions = plan.assumptions ?? `账户演示利率 ${plan.input.rate}%　分红演示水平 ${plan.input.dividend}%　${plan.factor ? `一次性领取 ${plan.input.receive}岁` : '一次性领取 未设计'}`;
      fit(ctx, assumptions, gridWidth - 24, 12);
      ctx.fillText(assumptions, left + 12, 129);
      if (plan.factor) {
        const payout = `一次性领取演示金额 ${formatValue(plan.lumpAmount)} 元　基本保险金额 × ${plan.factor} 倍`;
        fit(ctx, payout, gridWidth - 24, 12);
        ctx.fillText(payout, left + 12, 148);
      }

      const narrowWidth = 47;
      const narrowCount = group.filter(column => column.kind === 'integer').length;
      const regularWidth = narrowCount === group.length
        ? gridWidth / group.length
        : (gridWidth - narrowCount * narrowWidth) / (group.length - narrowCount);
      const widths = group.map(column => column.kind === 'integer' && narrowCount !== group.length ? narrowWidth : regularWidth);
      ctx.fillStyle = '#603932';
      ctx.fillRect(left, tableTop, gridWidth, headerHeight);
      let x = left;
      for (const [i, column] of group.entries()) {
        ctx.fillStyle = '#ffffff';
        fit(ctx, '', widths[i], 12);
        const lines = wrap(ctx, column.label, widths[i] - 8);
        ctx.textAlign = 'center';
        lines.forEach((line, j) => ctx.fillText(line, x + widths[i] / 2, tableTop + headerHeight / 2 + (j - (lines.length - 1) / 2) * 13));
        x += widths[i];
      }
      const firstAnnuity = plan.rows.find(row => row.annuity > 0)?.year;
      const batch = rows.slice(offset, offset + rowsPerPage);
      for (const [i, row] of batch.entries()) {
        const y = tableTop + headerHeight + i * rowHeight;
        const highlight = row.lumpSum > 0 || row.year === firstAnnuity;
        ctx.fillStyle = highlight ? '#f3e4d6' : i % 2 ? '#fbf9f7' : '#ffffff';
        ctx.fillRect(left, y, gridWidth, rowHeight);
        x = left;
        for (const [j, column] of group.entries()) {
          const value = formatValue(row[column.key], column.kind);
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
}

export async function exportPlanPdf(plan, columns, rows) {
  const pdf = await globalThis.PDFLib.PDFDocument.create();
  pdf.setTitle(`${plan.productTitle ?? PRODUCT} 利益演示`);
  await drawPlanPages(plan, columns, rows, (width, height, wide) => {
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
      const page = pdf.addPage(wide ? [841.89, 595.28] : [595.28, 841.89]);
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    } };
  });
  return pdf.save();
}
