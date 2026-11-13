function suiteJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...pdfHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function submitSuite(request, action, fixedEntry) {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return suiteJson({ error: '请从计划书页面提交。' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return suiteJson({ error: '请求参数格式有误。' }, 415);
  let data;
  let result;
  try {
    const body = await request.text();
    if (body.length > 18000) return suiteJson({ error: '请求参数过长。' }, 413);
    data = JSON.parse(body);
    result = suitePlan(data, action !== 'plan');
  } catch (error) {
    return suiteJson({ error: error instanceof TypeError || error instanceof SyntaxError ? '请检查计划书输入。' : error.message }, 400);
  }
  if (action === 'plan') return suiteJson(result.plan);
  if (pdfKey.length !== 32) return suiteJson({ error: 'PDF 服务尚未配置。' }, 503);
  const ticket = fixedEntry ? null : previewTicket(request);
  const expires = Math.min(Date.now() + 30 * 60 * 1000, ticket?.expires ?? Infinity);
  const token = sealPdfPlan({ product: data.product, input: result.plan.input, columns: data.columns, expires }, pdfKey);
  if (token.length > 5000) return suiteJson({ error: '领取项目较多，请分成两份方案生成 PDF。' }, 413);
  const output = { download: `/api/suite/save-${token}.pdf${ticket?.query ?? ''}` };
  if (action === 'file') {
    try {
      output.pdf = Buffer.from(await renderVectorPdf(result.plan, result.columns, { PDFLib, fontkit, pdfFont })).toString('base64');
    } catch {
      return suiteJson({ error: 'PDF 暂时无法生成，请再试一次。' }, 500);
    }
  }
  return suiteJson(output);
}

export default async function onRequest({ request, params, fixedEntry = false }) {
  const action = params?.file ?? new URL(request.url).pathname.split('/').at(-1);
  if (request.method === 'GET' && action === 'share-entry') {
    if (fixedEntry) return suiteJson({ url: '/six.html', expiresAt: null });
    const ticket = previewTicket(request);
    if (!ticket) return suiteJson({ error: '试用链接已到期。' }, 401);
    return suiteJson({ url: `/six.html${ticket.query}`, expiresAt: ticket.expires });
  }
  if (request.method === 'POST' && ['plan', 'link', 'file'].includes(action)) return submitSuite(request, action, fixedEntry);
  if (!['GET', 'HEAD'].includes(request.method)) return pdfText('请从计划书页面操作。', 405);
  const match = /^save-([A-Za-z0-9_-]{39,5000})\.pdf$/.exec(action);
  if (!match) return pdfText('地址无效，请返回计划书页面。', 404);
  if (pdfKey.length !== 32) return pdfText('PDF 服务尚未配置。', 503);
  let data;
  try { data = openPdfPlan(match[1], pdfKey); }
  catch { return pdfText('PDF 链接已失效，请重新生成。', 404); }
  if (data.expires <= Date.now()) return pdfText('PDF 链接已过期，请重新生成。', 410);
  try {
    const { plan, columns } = suitePlan(data, true);
    const headers = {
      ...pdfHeaders, 'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="insurance-plan.pdf"; filename*=UTF-8''${encodeURIComponent(planPdfFilename(plan))}`,
    };
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(await renderVectorPdf(plan, columns, { PDFLib, fontkit, pdfFont }), { headers });
  } catch {
    return pdfText('PDF 暂时无法生成，请重新生成。', 500);
  }
}
