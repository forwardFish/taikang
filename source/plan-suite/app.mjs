const element = id => document.getElementById(id);
const bundles = JSON.parse(element('suite-data').textContent);
const hosted = bundles.hosted === true;
const selectedByProduct = new Map();
const productSelect = element('product');
const state = { id: 'xingfu', model: null, columns: [], plan: null, pdf: null, pdfFile: null, exportVersion: 0, loadVersion: 0, submitVersion: 0 };
const current = () => SUITE_PRODUCTS[state.id];

function create(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function message(id, text) {
  const node = element(id);
  node.textContent = text;
  node.hidden = !text;
}

function options(select, values, label, preferred) {
  select.replaceChildren(...values.map(value => {
    const option = create('option', label(value));
    option.value = value;
    return option;
  }));
  if (values.includes(preferred)) select.value = String(preferred);
  select.disabled = !values.length;
}

function recommend() {
  const choices = state.id === 'xingfu' ? [...DEFAULT_COLUMNS] : current().defaults.split(' ');
  if (current().lumpPayout && Number(element('start').value)) choices.splice(choices.indexOf('annuity') + 1, 0, 'lumpSum');
  if (current().account &&
      [...element('withdrawal-stages').querySelectorAll('[data-withdrawal-amount]')].some(input => input.valueAsNumber > 0)) {
    choices.push(current().withdrawals[0].cell);
  }
  return choices;
}

function selectedColumns() {
  const selected = new Set(selectedByProduct.get(state.id) ?? recommend());
  return state.columns.filter(column => selected.has(column.key));
}

function updateSelection() {
  const selected = selectedColumns();
  element('selected-summary').textContent = `已选 ${selected.length} 项 · ${selected.map(column => column.label).join('、')}`;
}

function updateAmounts() {
  const premium = element('premium').valueAsNumber;
  const term = Number(element('term').value);
  element('total').textContent = Number.isFinite(premium) && premium > 0 && term > 0 ? `${formatValue(premium * term)} 元` : '—';
  for (const button of document.querySelectorAll('[data-premium]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.premium) === premium));
  }
}

function choicesFor(age, sex, term) {
  if (!hosted) return suiteChoices(state.id, state.model, age, sex, term);
  const options = bundles.products[state.id].eligibility[`${age}${sex}`] ?? {};
  return { terms: Object.keys(options).map(Number), starts: options[term] ?? [] };
}

function updateChoices(preferredTerm = Number(element('term').value), preferredStart = Number(element('start').value)) {
  const age = element('age').valueAsNumber;
  const sex = element('sex').value;
  const { terms } = choicesFor(age, sex, preferredTerm);
  options(element('term'), terms, termLabel, preferredTerm);
  element('term-help').textContent = terms.length ? `可选 ${terms.map(termLabel).join('、')}` : '该年龄和性别在此版本中没有可选缴费期间。';
  const { lumpPayout, startChoices } = current();
  const showStart = lumpPayout || startChoices;
  const { starts } = choicesFor(age, sex, Number(element('term').value));
  element('start-field').hidden = !showStart;
  element('start-label').textContent = lumpPayout ? '一次性领取年龄' : '年金起领方式';
  options(element('start'), lumpPayout ? [0, ...starts] : starts,
    value => lumpPayout ? (value ? `${value} 岁` : '未设计') : startLabel(value), preferredStart);
  message('start-help', showStart ? (starts.length ? '按当前年龄、性别和缴费期间筛选。' : '当前条件没有可选领取年龄。') : '');
  element('generate').disabled = !terms.length || !!current().startChoices && !starts.length;
  updateAmounts();
  updateSelection();
}

function fillExample() {
  const defaults = (hosted && bundles.products[state.id].initial) || current().initial;
  for (const key of ['age', 'sex', 'premium', 'dividend', 'rate']) element(key).value = defaults[key] ?? '';
  const rate = element('rate');
  rate.disabled = !current().account;
  element('rate-field').hidden = rate.disabled;
  if (current().account) [rate.min, rate.max] = current().account;
  const withdrawals = element('withdrawals');
  withdrawals.hidden = !!current().account || !current().withdrawals?.length;
  withdrawals.open = false;
  element('withdraw-list').replaceChildren();
  element('withdrawal-note').textContent = current().withdrawalNote ?? '按保单年度填写金额，演示结果将随领取金额重新计算。';
  element('withdrawal-schedule').hidden = !current().account;
  element('withdrawal-stages').replaceChildren();
  message('withdrawal-stage-note', current().account ? current().withdrawalNote ?? '' : '');
  updateChoices(defaults.term, defaults.start ?? defaults.receive ?? 0);
  message('form-error', '');
}

function clearPdf() {
  state.exportVersion++;
  if (state.pdf) URL.revokeObjectURL(state.pdf);
  state.pdf = null;
  state.pdfFile = null;
  element('save-pdf').removeAttribute('href');
  element('share-pdf').hidden = true;
  element('pdf-actions').hidden = true;
  element('export').disabled = false;
  message('pdf-status', '');
}

function showForm() {
  element('form-view').hidden = false;
  element('preview-view').hidden = true;
  window.scrollTo(0, 0);
}

async function loadProduct(id) {
  const version = ++state.loadVersion;
  element('form-view').hidden = true;
  element('preview-view').hidden = true;
  state.plan = null;
  clearPdf();
  message('load-status', '正在载入本版本演算数据…');
  try {
    let model;
    if (!hosted) {
      const bytes = Uint8Array.from(atob(bundles[id]), char => char.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      model = await new Response(stream).json();
    }
    if (version !== state.loadVersion) return;
    state.id = id;
    state.model = model;
    state.columns = hosted ? bundles.products[id].columns : suiteColumns(id, model);
    const heading = element('product-title');
    const title = current().title;
    const productType = '保险产品计划';
    if (title.endsWith(productType)) {
      heading.replaceChildren(title.slice(0, -productType.length), create('span', productType, 'product-type'));
    } else {
      heading.textContent = title;
    }
    fillExample();
    message('load-status', '');
    showForm();
  } catch {
    if (version === state.loadVersion) message('load-status', hosted ? '无法载入产品，请刷新网页重试。' : '无法载入。请用新版 Chrome 或 Edge 打开这个本地文件。');
  }
}

function readInputs() {
  const withdrawals = [...element('withdraw-list').children].flatMap(row => {
    const [year, item, amount] = row.querySelectorAll('input,select');
    return year.value || amount.value ? [{ year: year.valueAsNumber, cell: item.value, amount: amount.valueAsNumber }] : [];
  });
  const withdrawalStages = [...element('withdrawal-stages').children].map(row => {
    const [from, to, amount] = row.querySelectorAll('input');
    return { from: from.valueAsNumber, to: to.valueAsNumber, amount: amount.valueAsNumber };
  });
  const receive = Number(element('start').value);
  return { age: element('age').valueAsNumber, sex: element('sex').value, term: Number(element('term').value),
    premium: element('premium').valueAsNumber, dividend: element('dividend').valueAsNumber,
    rate: element('rate').valueAsNumber, start: receive, receive,
    ...(withdrawalStages.length ? { withdrawalStages } : { withdrawals }) };
}

function renderPreview() {
  clearPdf();
  const plan = state.plan;
  const columns = selectedColumns();
  const yearKey = current().year ?? 'year';
  element('document-version').textContent = `数据版本 ${current().version} · 金额单位 元 · ${plan.rows.length} 个保单年度`;
  element('document-title').textContent = current().title;
  element('document-summary').textContent = `${planHeadline(plan)}　计划总保费 ${formatValue(plan.totalPremium)} 元`;
  element('document-assumptions').textContent = plan.assumptions ?? `账户演示利率 ${plan.input.rate}%　分红演示水平 ${plan.input.dividend}%　${plan.factor ? `${plan.input.receive} 岁一次性领取 ${formatValue(plan.lumpAmount)} 元` : '未设计一次性领取'}`;
  const head = create('tr');
  for (const column of columns) head.append(create('th', column.label, column.key === yearKey ? 'policy-year' : undefined));
  element('plan-head').replaceChildren(head);
  const firstAnnuity = plan.rows.find(row => row.annuity > 0)?.year;
  const withdrawalYears = plannedWithdrawalYears(plan.input);
  element('plan-body').replaceChildren(...plan.rows.map(row => {
    const tr = create('tr', undefined, row.lumpSum || row.year === firstAnnuity || withdrawalYears.has(row.year) ? 'key-year' : '');
    for (const column of columns) {
      const className = column.key === yearKey ? 'policy-year' :
        column.kind === 'withdrawal' && row[column.key] > 0 ? 'withdrawal-value' : undefined;
      tr.append(create('td', formatValue(row[column.key], column.kind), className));
    }
    return tr;
  }));
  element('plan-notes').textContent = plan.notes ?? RISK_NOTES.join('\n');
  element('form-view').hidden = true;
  element('preview-view').hidden = false;
}

const dialog = element('settings');
function markChoices(keys) {
  const set = new Set(keys);
  for (const checkbox of element('column-choices').querySelectorAll('input')) checkbox.checked = set.has(checkbox.value);
}

function openSettings() {
  element('settings-product').textContent = `${current().title} · ${current().version}`;
  message('settings-error', '');
  const groups = new Map();
  for (const column of state.columns) {
    if (!groups.has(column.group)) groups.set(column.group, []);
    groups.get(column.group).push(column);
  }
  element('column-choices').replaceChildren(...[...groups].map(([title, columns]) => {
    const section = create('section');
    section.append(create('h3', title, 'suite-label'));
    const list = create('div', undefined, 'suite-choices');
    for (const column of columns) {
      const label = create('label');
      const checkbox = create('input');
      checkbox.type = 'checkbox';
      checkbox.value = column.key;
      label.append(checkbox, document.createTextNode(column.label));
      list.append(label);
    }
    section.append(list);
    return section;
  }));
  markChoices(selectedColumns().map(column => column.key));
  dialog.showModal();
}

function addWithdrawal() {
  const line = create('div', undefined, 'suite-withdraw');
  const year = create('input');
  Object.assign(year, { type: 'number', min: 1, max: 106, step: 1, placeholder: '保单年度' });
  year.setAttribute('aria-label', '领取保单年度');
  const type = create('select');
  type.setAttribute('aria-label', '领取项目');
  options(type, current().withdrawals.map(item => item.cell), value => current().withdrawals.find(item => item.cell === value).label);
  const amount = create('input');
  Object.assign(amount, { type: 'number', min: 0, step: 0.01, placeholder: '金额（元）' });
  amount.setAttribute('aria-label', '领取金额（元）');
  const remove = create('button', '删除');
  remove.type = 'button';
  remove.addEventListener('click', () => line.remove());
  line.append(year, type, amount, remove);
  element('withdraw-list').append(line);
  year.focus();
}

function updateWithdrawalStages() {
  message('form-error', '');
  for (const [index, row] of [...element('withdrawal-stages').children].entries()) {
    const title = `领取阶段 ${index + 1}`;
    row.querySelector('h3').textContent = title;
    row.querySelector('button').setAttribute('aria-label', `删除${title}`);
  }
  updateSelection();
}

function addWithdrawalStage() {
  const list = element('withdrawal-stages');
  const selected = selectedByProduct.get(state.id);
  const withdrawalColumn = current().withdrawals[0].cell;
  if (!list.children.length && selected && !selected.includes(withdrawalColumn)) {
    selectedByProduct.set(state.id, [...selected, withdrawalColumn]);
  }
  const row = create('div', undefined, 'withdrawal-stage');
  const header = create('div', undefined, 'withdrawal-stage-header');
  const remove = create('button', '删除', 'text-button');
  remove.type = 'button';
  remove.addEventListener('click', () => {
    row.remove();
    updateWithdrawalStages();
  });
  header.append(create('h3'), remove);
  row.append(header);
  for (const [label, amount] of [['开始年度', false], ['结束年度', false], ['每年领取金额（元）', true]]) {
    const field = create('label', label);
    const input = create('input');
    Object.assign(input, { type: 'number', required: true, min: amount ? 0.01 : 1, step: amount ? 0.01 : 1 });
    input.inputMode = amount ? 'decimal' : 'numeric';
    if (amount) {
      input.dataset.withdrawalAmount = '';
      input.addEventListener('input', updateSelection);
    } else {
      input.max = MAX_POLICY_YEARS;
    }
    field.append(input);
    row.append(field);
  }
  list.append(row);
  updateWithdrawalStages();
  row.querySelector('input').focus();
}

productSelect.replaceChildren(...Object.keys(hosted ? bundles.products : bundles).map(id => {
  const config = SUITE_PRODUCTS[id];
  const option = create('option', `${config.short} · ${config.version}`);
  option.value = id;
  return option;
}));
productSelect.disabled = false;
productSelect.addEventListener('change', () => loadProduct(productSelect.value));
element('sample').addEventListener('click', fillExample);
for (const id of ['age', 'sex', 'term']) element(id).addEventListener('input', () => updateChoices());
element('start').addEventListener('input', updateSelection);
element('premium').addEventListener('input', updateAmounts);
for (const button of document.querySelectorAll('[data-premium]')) button.addEventListener('click', () => {
  element('premium').value = button.dataset.premium;
  updateAmounts();
});
element('add-withdrawal').addEventListener('click', addWithdrawal);
element('add-withdrawal-stage').addEventListener('click', addWithdrawalStage);
element('withdrawal-stages').addEventListener('input', () => message('form-error', ''));
element('withdrawal-schedule').addEventListener('focusin', event => {
  const control = event.target;
  const actions = element('generate').closest('.form-actions');
  if (getComputedStyle(actions).position === 'sticky') {
    const overlap = control.getBoundingClientRect().bottom - actions.getBoundingClientRect().top;
    if (overlap > 0) window.scrollBy(0, overlap + 8);
  }
});
element('back').addEventListener('click', showForm);
for (const id of ['form-settings', 'preview-settings']) element(id).addEventListener('click', openSettings);
element('select-all').addEventListener('click', () => markChoices(state.columns.map(column => column.key)));
element('select-default').addEventListener('click', () => markChoices(recommend()));
element('cancel-settings').addEventListener('click', () => dialog.close());
element('apply-settings').addEventListener('click', () => {
  const keys = [...element('column-choices').querySelectorAll('input:checked')].map(input => input.value);
  if (!keys.length) { message('settings-error', '请至少选择一个展示项目。'); return; }
  selectedByProduct.set(state.id, keys);
  updateSelection();
  dialog.close();
  if (!element('preview-view').hidden) renderPreview();
});
async function suiteRequest(action, data) {
  const response = await fetch(`/api/suite/${action}`, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (response.status === 401) throw new Error('试用链接缺少校验参数或已到期，请从微信聊天打开完整试用链接。');
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('暂时无法连接演算服务，请稍后再试。');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '暂时无法处理，请稍后再试。');
  return result;
}

element('plan-form').addEventListener('submit', async event => {
  event.preventDefault();
  const load = state.loadVersion;
  const submit = ++state.submitVersion;
  const button = element('generate');
  message('form-error', '');
  if (hosted) { button.disabled = true; button.textContent = '正在演算…'; }
  try {
    const input = readInputs();
    const plan = hosted ? await suiteRequest('plan', { product: state.id, input }) : calculateSuite(state.id, state.model, input, state.columns);
    if (load !== state.loadVersion || submit !== state.submitVersion) return;
    state.plan = plan;
    renderPreview();
    window.scrollTo(0, 0);
  } catch (error) {
    if (load === state.loadVersion && submit === state.submitVersion) {
      message('form-error', error instanceof TypeError ? '暂时无法演算，请检查网络后重试。' : error.message);
    }
  } finally {
    if (hosted && submit === state.submitVersion) {
      button.textContent = '生成计划书';
      if (load === state.loadVersion) button.disabled = !element('term').value || !!current().startChoices && !element('start').value;
    }
  }
});

const inWeChat = hosted && /MicroMessenger/i.test(navigator.userAgent);
element('share-pdf').addEventListener('click', async () => {
  try { await sharePdf(state.pdfFile); }
  catch (error) {
    if (error.name !== 'AbortError') message('pdf-status', '当前浏览器无法打开文件分享，请点「保存或转发 PDF」继续。');
  }
});

element('export').addEventListener('click', async () => {
  const version = ++state.exportVersion;
  const plan = state.plan;
  const columns = visiblePdfColumns(selectedColumns(), plan.rows);
  if (!columns.length) {
    message('pdf-status', EMPTY_PDF_COLUMNS);
    return;
  }
  element('export').disabled = true;
  message('pdf-status', '正在生成 PDF…');
  try {
    const filename = planPdfFilename(plan);
    const result = hosted ? await suiteRequest(canSharePdf() ? 'file' : 'link', {
      product: state.id, input: plan.input, columns: columns.map(column => column.key),
    }) : await exportPlanPdf(plan, columns, plan.rows);
    if (version !== state.exportVersion) return;
    const save = element('save-pdf');
    if (hosted) {
      const download = new URL(result.download, location.href);
      save.href = inWeChat ? createPdfSharePage(download.href, filename).href : download.href;
      if (inWeChat) { save.removeAttribute('download'); save.textContent = '保存或转发 PDF'; }
      else save.download = filename;
      if (result.pdf) {
        const { file } = preparePdfFile(Uint8Array.from(atob(result.pdf), char => char.charCodeAt(0)), filename);
        if (file && canSharePdf(file)) {
          state.pdfFile = file;
          element('share-pdf').hidden = false;
        }
      }
    } else {
      state.pdf = URL.createObjectURL(new Blob([result], { type: 'application/pdf' }));
      save.href = state.pdf;
      save.download = filename;
    }
    element('pdf-info').textContent = `PDF 已生成 · ${plan.rows.length} 行 · ${columns.length} 项`;
    element('pdf-actions').hidden = false;
    message('pdf-status', '');
  } catch (error) {
    if (version === state.exportVersion) {
      message('pdf-status', hosted && !(error instanceof TypeError) ? error.message : 'PDF 生成失败，请再试一次。');
    }
  } finally {
    if (version === state.exportVersion) element('export').disabled = !hosted && !!state.pdf;
  }
});
loadProduct(productSelect.value);
