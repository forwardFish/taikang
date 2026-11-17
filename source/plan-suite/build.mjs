import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { SUITE_PRODUCTS, suiteChoices, suiteColumns } from './products.mjs';
import { DEMO_INPUT, demoChoices } from './demo-plan.mjs';

const root = import.meta.dirname;
const vercel = process.argv.includes('--vercel');
const demo = vercel && process.argv.includes('--demo');
const includeXingfuB = !demo && process.argv.includes('--with-xingfu-b');
const hosted = vercel || process.argv.includes('--wechat');
const realSite = vercel && !demo;
const read = name => readFile(resolve(root, name), 'utf8');
const shared = '../xingfu-plan/';
const project = resolve(root, '../..');
const pdfLibraryPath = resolve(project, 'node_modules/pdf-lib/dist/pdf-lib.min.js');
const [template, style, pdfLibrary, calculation, pdf, spreadsheet, xingfuB, products, sharing, previewShare, app] = await Promise.all([
  read('index.template.html'), read(shared + 'style.css'), readFile(pdfLibraryPath, 'utf8'),
  read(shared + 'calculate.mjs'), read(shared + 'export-pdf.mjs'), read('spreadsheet.mjs'), read('xingfu-b.mjs'), read('products.mjs'),
  read(shared + 'pdf-sharing.mjs'), read(shared + 'preview-share.mjs'), read('app.mjs'),
]);
const library = pdfLibrary.replace(/^\/\/# sourceMappingURL=.*$/gm, '');
const productIds = Object.keys(SUITE_PRODUCTS).filter(id => id !== 'xingfu-b' || includeXingfuB);
const models = await Promise.all(productIds.map(async id => [id,
  await read(id === 'xingfu' ? shared + 'inspection/model.json' : `models/${id}.json`),
]));
const compressed = demo ? null : Object.fromEntries(models.map(([id, model]) => [id, gzipSync(model, { level: 6 }).toString('base64')]));
const demoColumns = demo ? Object.fromEntries(models.map(([id, model]) => [id, suiteColumns(id, JSON.parse(model))])) : null;
const plain = source => source.replace(/^import [^\n]*;\r?\n/gm, '').replace(/^export /gm, '');
const pageStyle = realSite ? style + '\n' + await read('real-site-theme.css') : style;
const heroStyle = realSite ? `\n.real-site { --plan-hero-image: url("data:image/webp;base64,${await readFile(resolve(root, 'hero-wine-garden.webp'), 'base64')}"); }` : '';
const render = (page, scripts, data = '', extraStyle = '') => page.replace('<!-- STYLE -->', () => `<style>${pageStyle}${extraStyle}</style>`)
  .replace('<!-- DATA -->', () => data)
  .replace('<!-- SCRIPTS -->', () => scripts);
const moduleTag = source => `<script type="module">${source}</script>`;

function publicData() {
  return { hosted: true, products: Object.fromEntries(models.map(([id, text]) => {
    const model = demo ? null : JSON.parse(text);
    const choices = (age, sex, term) => demo ? demoChoices(id, age, term) : suiteChoices(id, model, age, sex, term);
    const eligibility = {};
    for (let age = 0; age <= 80; age++) {
      for (const sex of ['M', 'F']) {
        const { terms } = choices(age, sex, 0);
        if (terms.length) eligibility[`${age}${sex}`] = Object.fromEntries(terms.map(term => [term, choices(age, sex, term).starts]));
      }
    }
    return [id, { eligibility, columns: demo ? demoColumns[id] : suiteColumns(id, model), ...(demo && { initial: DEMO_INPUT }) }];
  })) };
}

const previewShareCode = hosted && !realSite ? [previewShare, 'setupPreviewShare();'] : [];
const browserCode = plain([calculation, pdf, ...(hosted ? [] : [spreadsheet]), xingfuB, products, sharing, app, ...previewShareCode].join('\n'));
const trialLabel = demo ? '模拟资料' : vercel ? '' : hosted ? '微信试用' : '本地试用';
const page = template.replace('<!-- TRIAL BADGE -->', trialLabel ? `<span class="trial">${trialLabel}</span>` : '')
  .replace('<body>', realSite ? '<body class="real-site">' : '<body>')
  .replace(/    <!-- PREVIEW SHARE START -->\s*([\s\S]*?)    <!-- PREVIEW SHARE END -->\n?/, hosted && !realSite ? '    $1' : '');
const html = render(page,
  `${hosted ? '' : `<script>${library}</script>`}${moduleTag(browserCode)}`,
  `<script type="application/json" id="suite-data">${JSON.stringify(hosted ? publicData() : compressed).replaceAll('<', '\\u003c')}</script>`, heroStyle);

if (hosted) {
  const directory = resolve(project, demo ? '.build/demo/public' : vercel ? '.build/vercel/public' : '.build/wechat');
  const functions = resolve(directory, vercel ? '../server' : 'cloud-functions/api/suite');
  const functionPath = resolve(functions, vercel ? 'suite.mjs' : '[file].js');
  const [access, vector, handler, fontkit, font, shareTemplate, sharePage, previousFunction, provider] = await Promise.all([
    read(shared + 'pdf-access.mjs'), read(shared + 'pdf-vector.mjs'), read('cloud-handler.mjs'),
    read(shared + 'vendor/fontkit.umd.min.js'), readFile(resolve(root, 'suite-font.ttf')),
    read(shared + 'pdf-share.template.html'), read(shared + 'pdf-share-page.mjs'),
    vercel ? '' : readFile(functionPath, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    }),
    read(demo ? 'demo-plan.mjs' : 'model-plan.mjs'),
  ]);
  const pdfKey = vercel ? "Buffer.from(process.env.PDF_LINK_SECRET ?? '', 'base64url')"
    : `Buffer.from('${previousFunction.match(/^const pdfKey = Buffer\.from\('([0-9a-f]{64})', 'hex'\);$/m)?.[1] ?? randomBytes(32).toString('hex')}', 'hex')`;
  const bundled = (name, source) => `const ${name} = (() => { const module = { exports: {} }; const exports = module.exports;\n${source}\nreturn module.exports; })();`;
  const functionCode = [
    bundled('PDFLib', library), bundled('fontkit', fontkit),
    `const pdfFont = Buffer.from('${font.toString('base64')}', 'base64');`,
    `const pdfKey = ${pdfKey};`,
    `const suiteModelData = ${JSON.stringify(demo ? demoColumns : compressed)};`,
    plain([calculation, pdf, ...(demo ? [] : [spreadsheet]), xingfuB, products].join('\n')), access, plain(vector),
    demo ? plain(provider) : provider, handler,
  ].join('\n');
  const handoff = render(shareTemplate.replace(' · 幸福享裕', ' · 计划书工作台'), moduleTag(`${plain(sharing)}\n${sharePage}`));
  await Promise.all([mkdir(functions, { recursive: true }), mkdir(directory, { recursive: true })]);
  await Promise.all([
    writeFile(resolve(directory, 'six.html'), html), writeFile(resolve(directory, 'six-pdf.html'), handoff),
    writeFile(functionPath, functionCode),
  ]);
  if (vercel) {
    const appDirectory = resolve(directory, '..');
    await Promise.all([
      mkdir(resolve(appDirectory, 'api'), { recursive: true }),
      mkdir(resolve(directory, 'licenses'), { recursive: true }),
    ]);
    await Promise.all([
      ...['api/suite.js', 'vercel.json'].map(name => copyFile(resolve(project, name), resolve(appDirectory, name))),
      ...['fontkit-LICENSE.txt', 'NotoSansSC-OFL.txt', 'pdf-lib-LICENSE.md'].map(name =>
        copyFile(resolve(project, 'public/licenses', name), resolve(directory, 'licenses', name))),
      writeFile(resolve(appDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module', engines: { node: '22.x' } }, null, 2) + '\n'),
    ]);
  }
  console.log(JSON.stringify({ products: models.length, htmlBytes: Buffer.byteLength(html), functionBytes: Buffer.byteLength(functionCode) }));
} else {
  const directory = resolve(project, includeXingfuB ? '.build/offline' : 'offline');
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, 'index.html');
  await writeFile(output, html);
  console.log(JSON.stringify({ products: models.length, bytes: Buffer.byteLength(html) }));
}
