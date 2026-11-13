const pdfType = 'application/pdf';

export function canSharePdf(file) {
  if (typeof File !== 'function' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const sample = file ?? new File(['%PDF-1.7'], 'xingfu-plan.pdf', { type: pdfType });
    return navigator.canShare({ files: [sample] });
  } catch {
    return false;
  }
}

export async function loadPdfForSharing(download, filename) {
  const response = await fetch(download, { cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== pdfType) {
    throw new Error('无法取得 PDF 文件，请返回计划书页面重新生成。');
  }
  const header = response.headers.get('Content-Disposition') ?? '';
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const name = encodedName ? pdfFilename(decodeURIComponent(encodedName), filename) : filename;
  return preparePdfFile(new Uint8Array(await response.arrayBuffer()), name);
}

export function preparePdfFile(bytes, filename) {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('取得的文件不是有效的 PDF。');
  const file = typeof File === 'function' ? new File([bytes], filename, { type: pdfType }) : null;
  return { blob: file ?? new Blob([bytes], { type: pdfType }), file, filename };
}

export function sharePdf(file) {
  return navigator.share({ files: [file] });
}

export function createPdfSharePage(download, filename) {
  const file = new URL(download);
  const page = new URL(file.pathname.startsWith('/api/suite/') ? '/six-pdf.html' : '/pdf-share.html', file.origin);
  for (const key of ['eo_token', 'eo_time']) {
    if (file.searchParams.has(key)) page.searchParams.set(key, file.searchParams.get(key));
  }
  // The gateway strips its own top-level query fields on redirect. The complete
  // PDF address also travels in a regular query field that survives the redirect.
  page.searchParams.set('file', file.pathname + file.search);
  page.hash = new URLSearchParams({ name: filename }).toString();
  return page;
}

export function readPdfSharePage(href) {
  const page = new URL(href);
  const parameters = new URLSearchParams(page.hash.slice(1));
  const file = new URL(page.searchParams.get('file') ?? parameters.get('file') ?? '/', page.origin);
  if (file.origin !== page.origin || !/^\/api\/(?:plan-pdf|suite)\/save-[A-Za-z0-9_-]{39,5000}\.pdf$/.test(file.pathname)) {
    throw new Error('这个 PDF 链接不完整，请回到计划书页面重新生成。');
  }
  const filename = pdfFilename(parameters.get('name') ?? '');
  return { file, filename, page: createPdfSharePage(file.href, filename) };
}

function pdfFilename(name, fallback = '幸福享裕计划书.pdf') {
  return /^[\p{L}\p{N}_（）() -]{1,80}\.pdf$/u.test(name) ? name : fallback;
}

export async function copyPdfAddress(address) {
  try {
    await navigator.clipboard.writeText(address.value);
    return '链接已复制，请粘贴到手机浏览器的地址栏打开。';
  } catch {
    address.hidden = false;
    address.focus();
    address.select();
    return '请长按复制选中的完整链接，再粘贴到手机浏览器打开。';
  }
}
