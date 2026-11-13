function setupPreviewShare() {
  const box = document.getElementById('preview-share');
  const copy = document.getElementById('copy-preview-link');
  const address = document.getElementById('preview-link-address');
  const status = document.getElementById('preview-share-status');
  box.hidden = false;

  const ticket = fetch('/api/suite/share-entry', { cache: 'no-store' }).then(async response => {
    if (!response.ok) return null;
    const { url, expiresAt } = await response.json();
    const link = new URL(url, location.origin);
    return link.origin === location.origin && link.pathname === '/six.html' ? { link, expiresAt } : null;
  }).catch(() => null);

  copy.addEventListener('click', async () => {
    const result = await ticket;
    if (!result || (result.expiresAt !== null && result.expiresAt <= Date.now())) {
      status.textContent = '请用仍在有效期内的完整试用链接重新打开，再复制转发。';
      return;
    }
    address.value = result.link.href;
    try {
      await navigator.clipboard.writeText(address.value);
      address.hidden = true;
      status.textContent = '已复制完整链接，粘贴到微信聊天发送即可。';
    } catch {
      address.hidden = false;
      address.focus();
      address.select();
      status.textContent = '长按下方地址并复制，再粘贴到微信聊天发送。';
    }
  });
}
