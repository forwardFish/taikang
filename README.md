# 泰康保险计划书工作台

## 换电脑使用

从 GitHub 下载 ZIP 或克隆仓库，解压后用新版 Chrome 或 Edge 打开 [offline/index.html](offline/index.html)。仓库自带的离线版包含原有六款产品，可以在本机填写、演算和导出 PDF，无需安装依赖或配置环境变量。增加幸福享裕 B 款的步骤见下文。 [打开线上工作台](https://plan.pathnook.com/)

## 重新部署

仓库根目录的 `api/`、`public/`、`server/` 和 `vercel.json` 是当前深酒红康养园林版的部署文件。Vercel 使用 Node.js 22。若在另一台电脑操作，从仓库根目录执行以下命令并选择正确的项目。

```powershell
npx vercel link
npx vercel deploy --prod
```

新项目首次部署前，在 Vercel 的 Production 环境变量中设置 `PDF_LINK_SECRET`。用下列命令生成新的 32 字节密钥，并在后台以敏感变量保存。已有项目继续使用其现有值。

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

固定域名由 Vercel 项目绑定，Cloudflare 负责 DNS。换机继续使用原 Vercel 项目时，域名记录沿用现有配置。

## 修改源码后重新构建

界面模板、样式和产品的演算逻辑在 `source/`。安装 Node.js 22 后，从仓库根目录运行以下命令。

```powershell
npm ci
npm run build:offline
npm run build:vercel
```

`build:offline` 生成 `offline/index.html`。`build:vercel` 生成独立部署目录 `.build/vercel/`，可以从该目录验证或重新部署。若要更新仓库根目录的部署文件，验证后将生成的 `public/six.html`、`public/six-pdf.html` 和 `server/suite.mjs` 同步回来。

演算模型对应交接包的 26.07 和 26.10 版。原始 Excel、历史部署包与账号配置保留在原交接目录。

## 构建含幸福享裕 B 款的七款版本

维护者在本地准备 26.11 版幸福享裕 B 款原表。安装 Python 的 `openpyxl` 和项目的 Node 依赖，再执行：

```powershell
python source/plan-suite/import-xingfu-b.py '原表的本机路径.xlsx'
npm run build:offline -- --with-xingfu-b
npm run build:vercel -- --with-xingfu-b
```

七款离线版在 `.build/offline/index.html`，供内部本地使用。七款线上版从 `.build/vercel/` 发布到已有生产项目，费率在服务器端计算，网页只拿到可选配置和单次演算结果。发布时保留原项目的域名和 `PDF_LINK_SECRET`。不要把原表、生成的 B 款模型、七款离线文件或含服务器模型的部署目录提交到公开仓库。
