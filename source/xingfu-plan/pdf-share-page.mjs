const element = id => document.getElementById(id);
const status = element('share-status');
const share = element('share-file');
const inWeChat = /MicroMessenger/i.test(navigator.userAgent);

async function prepareSharePage() {
  const { file, filename, page } = readPdfSharePage(location.href);
  element('share-filename').textContent = filename;
  element('share-tools').hidden = false;
  element('share-wechat-help').hidden = !inWeChat;
  const address = element('share-address');
  address.value = page.href;
  element('copy-share-address').addEventListener('click', async () => {
    status.textContent = await copyPdfAddress(address);
  });

  if (inWeChat && !canSharePdf()) return;
  status.textContent = '正在准备 PDF 文件…';
  const pdf = await loadPdfForSharing(file.href, filename);
  element('share-filename').textContent = pdf.filename;
  if (!inWeChat) {
    const save = element('save-file');
    save.href = URL.createObjectURL(pdf.blob);
    save.download = pdf.filename;
    save.hidden = false;
  }
  status.textContent = '';
  if (!pdf.file || !canSharePdf(pdf.file)) return;
  share.hidden = false;
  share.disabled = false;
  share.addEventListener('click', async () => {
    try {
      await sharePdf(pdf.file);
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = '系统暂时无法分享，请先下载 PDF，再从手机文件管理分享到微信。';
    }
  });
}

prepareSharePage().catch(error => {
  share.hidden = true;
  status.textContent = error instanceof TypeError ? '连接失败，请检查网络后重新打开本页。' : error.message;
});
