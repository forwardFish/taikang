import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const pdfHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function pdfText(message, status) {
  return new Response(message, {
    status, headers: { ...pdfHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export function sealPdfPlan(value, pdfKey) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', pdfKey, nonce);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url');
}

export function openPdfPlan(token, pdfKey) {
  const bytes = Buffer.from(token, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', pdfKey, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

export function previewTicket(request) {
  const cookies = (request.headers.get('Cookie') ?? '').split(';').map(part => part.trim());
  const token = cookies.find(part => part.startsWith('eo_token='))?.slice(9);
  const time = cookies.find(part => part.startsWith('eo_time='))?.slice(8);
  if (!/^[a-f0-9]{32}$/i.test(token ?? '') || !/^\d{10}$/.test(time ?? '')) return null;
  const expires = Number(time) * 1000 + 3 * 60 * 60 * 1000;
  return expires > Date.now() ? { query: `?eo_token=${token}&eo_time=${time}`, expires } : null;
}
