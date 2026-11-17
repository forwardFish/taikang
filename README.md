# 泰康保险计划书工作台

## 换电脑使用

从 GitHub 的 `xuyan` 分支下载 ZIP 或克隆后，用新版 Chrome 或 Edge 打开 [offline/index.html](offline/index.html)。离线网页已包含七款产品，可直接演算和导出 PDF。

[workbooks/](workbooks/) 存放七款产品的原始 Excel 演算表，包括 26.11 版幸福享裕 B 款。

## 重新部署

七款线上版需先按下文构建。Vercel 使用 Node.js 22。进入 `.build/vercel/` 后执行以下命令并选择正确的项目。

```powershell
npx vercel link
npx vercel deploy --prod
```

新项目首次部署前，在 Vercel 的 Production 环境变量中设置 `PDF_LINK_SECRET`。用下列命令生成新的 32 字节密钥，并在后台以敏感变量保存。已有项目继续使用其现有值。

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

固定域名由 Vercel 项目绑定，Cloudflare 负责 DNS。换机继续使用原 Vercel 项目时，域名记录沿用现有配置。

## 重新构建七款版

界面和演算逻辑在 `source/`。安装 Node.js 22、Python 和 `openpyxl` 后，从仓库根目录运行以下命令。

```powershell
npm ci
python source/plan-suite/import-xingfu-b.py 'workbooks/26.11_幸福享裕B_演算表.xlsx'
npm run build:offline -- --with-xingfu-b
Copy-Item -LiteralPath '.build/offline/index.html' -Destination 'offline/index.html'
npm run build:vercel -- --with-xingfu-b
```

六款既有演算模型使用仓库内的 26.07 和 26.10 版数据。B 款的模型由 26.11 版原表导入。七款线上版的构建输出位于 `.build/vercel/`。
