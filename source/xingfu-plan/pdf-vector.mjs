import { PRODUCT } from './calculate.mjs';
import { drawPlanPages } from './export-pdf.mjs';

function vectorPage(PDFLib, pdf, font, width, height, pageSize) {
  const page = pdf.addPage(pageSize);
  const scale = page.getWidth() / width;
  const pointY = y => (height - y) * scale;
  const color = value => PDFLib.rgb(...value.slice(1).match(/../g).map(part => Number.parseInt(part, 16) / 255));
  const ctx = {
    font: '12px sans-serif',
    textAlign: 'left',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    measureText(text) {
      return { width: font.widthOfTextAtSize(text, Number.parseFloat(this.font)) };
    },
    fillText(text, x, y) {
      const size = Number.parseFloat(this.font);
      const textWidth = this.measureText(text).width;
      const left = x - (this.textAlign === 'center' ? textWidth / 2 : this.textAlign === 'right' ? textWidth : 0);
      page.drawText(text, { x: left * scale, y: pointY(y + size * 0.34), size: size * scale, font, color: color(this.fillStyle) });
    },
    fillRect(x, y, w, h) {
      page.drawRectangle({ x: x * scale, y: pointY(y + h), width: w * scale, height: h * scale, color: color(this.fillStyle) });
    },
    drawRule(from, to, y) {
      page.drawLine({ start: { x: from * scale, y: pointY(y) }, end: { x: to * scale, y: pointY(y) }, thickness: scale, color: color(this.strokeStyle) });
    },
  };
  return { ctx, finish() {} };
}

export async function renderVectorPdf(plan, columns, { PDFLib, fontkit, pdfFont }) {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.setTitle(`${plan.productTitle ?? PRODUCT} 利益演示`);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(pdfFont);
  await drawPlanPages(plan, columns, plan.rows,
    (width, height, pageSize) => vectorPage(PDFLib, pdf, font, width, height, pageSize));
  return pdf.save();
}
