# PaperRail 运维速查

线上地址：https://qdxil.qzz.io （自定义域名） · 备用 https://paperrail.pages.dev
托管：Cloudflare Pages 项目 `paperrail`（生产分支 `main`，纯静态，免费套餐）
源码：https://github.com/qdx-loop/paperrail （AGPL-3.0，含全部修改说明 NOTICE.md）

## 一、结构与成本

- 全部处理在浏览器内完成（WASM），没有后端、没有数据库、不存储用户文件。
- 唯一的基础设施是 Cloudflare Pages 静态托管 + CDN + 自动 HTTPS；当前用量 $0/月。
- 域名 `qdxil.qzz.io` 是账号内的独立 zone（zone_tag `3bb69a714baa261c7e63151b10e642c6`），
  Pages 自定义域已添加；**DNS 里还缺一条 CNAME，见「二、首次上线的手动步骤」**。
- LibreOffice 引擎（Word/Excel/PPT→PDF）约 75MB，超过 Pages 单文件 25MB 限制，
  已切成 `libreoffice-wasm/soffice.wasm.gz.p0..p4` 等 20MB 分片，浏览器端下载、拼接、解压。

## 二、首次上线的手动步骤（只做一次）

1. Cloudflare Dashboard → 选择 zone `qzz.io` → DNS → Records → Add record：
   - Type: `CNAME`
   - Name: `@`（即 `qdxil.qzz.io` 本身；若控制台强制填全名就写 `qdxil.qzz.io`）
   - Target: `paperrail.pages.dev`
   - Proxy status: **Proxied（橙色云朵）**
2. 保存后回到 Workers & Pages → `paperrail` → Custom domains，
   `qdxil.qzz.io` 会在几分钟内从 `pending` 变 `active`，证书由 Cloudflare 自动签发。
3. 验证：

```bash
curl -sI https://qdxil.qzz.io/ | head -1          # 期望 200
curl -s  https://qdxil.qzz.io/robots.txt | grep Sitemap
# 期望 Sitemap: https://qdxil.qzz.io/sitemap.xml
```

说明：当前 API token（api.txt 第 11 行）有 Pages 写权限，但**没有 DNS:Edit**，
调用 `POST /zones/{id}/dns_records` 返回 `Authentication error 10000`，
所以这一步只能在控制台点，或换一个带 `Zone → DNS → Edit` 的 token 后执行：

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"qdxil.qzz.io","content":"paperrail.pages.dev","proxied":true,"ttl":1}'
```

## 三、日常更新

### 1) 代码/工具更新

```bash
cd /tmp/opencode/bentopdf-src
export SIMPLE_MODE=true SITE_URL=https://qdxil.qzz.io \
  VITE_BRAND_NAME=PaperRail VITE_BRAND_LOGO=assets/brand/logo.svg \
  VITE_USE_CDN=true \
  VITE_FOOTER_TEXT="© 2026 PaperRail · Built on BentoPDF (AGPL-3.0) · No uploads, ever"
# 注意：不要设置 VITE_LANGUAGES（不设 = 24 种语言全开）

node scripts/generate-static-tool-links.mjs
./node_modules/.bin/tsc            # tsc 不在 PATH，必须走 node_modules
npx vite build                     # 会花几分钟做 brotli/gzip，等进程真正退出
node scripts/generate-security-headers.mjs
SITE_URL=https://qdxil.qzz.io node scripts/generate-i18n-pages.mjs   # 生成 3220 个本地化页，约 5–10 分钟
PAPERRAIL_SRC=/tmp/opencode/bentopdf-src \
PAPERRAIL_BRAND=/tmp/opencode/brand node /tmp/opencode/postprocess.mjs

npx wrangler pages deploy dist --project-name paperrail --branch main
```

注意：
- 顺序不能变：`vite build` → `generate-security-headers` → **`generate-i18n-pages`** → `postprocess`。
- 不要在 `vite build` 还没退出时运行 postprocess（会与预压缩/清空目录竞态）。
- 不要用 `npm run build`（它不生成 i18n 页面，且不传 `SITE_URL`）。
- `generate-i18n-pages.mjs` 必须带 `SITE_URL`，否则 canonical/hreflang 会写回上游域名。
- postprocess 会：替换旧域名 `paperrail.pages.dev` → 现域名、修正本地化页里
  `/zh/guides/*` 这类死链（guides 只有英文）、重建 sitemap（3361 条）、
  给 >25MB 文件切片、写入 `_headers`。它是幂等的，可重复跑。
- 密钥只通过环境变量注入，不落盘：
  `CLOUDFLARE_API_TOKEN`（api.txt 第 11 行）、`CLOUDFLARE_ACCOUNT_ID`（第 10 行）。

### 2) 文案/落地页更新（about、privacy、guides）

改 `/tmp/opencode/brand/pages/` 下文件 → 重跑 postprocess（会拷贝进 dist）→ 重新 deploy。
新增 guide 时同时把它加进 postprocess 里 sitemap 的列表；guide 只有英文，不要放进 locales。

## 四、查看数据

- 访问量：Cloudflare Dashboard → Workers & Pages → `paperrail` → Analytics。
  目前没有开通 Cloudflare Web Analytics（API token 无 RUM 权限，报 10000）；
  需要时在控制台点开 Web Analytics 并添加站点，隐私页措辞已写成「may enable」。
- 部署与回滚：Workers & Pages → `paperrail` → Deployments，任选历史版本一键回滚。
- 错误排查：同页面的 Functions/日志（本站在 Pages 上是纯静态，日志主要看 404）。
- 搜索表现：上线后把站点加进 Google Search Console / Bing Webmaster Tools，
  提交 `https://qdxil.qzz.io/sitemap.xml`（3361 条 URL，含 24 种语言的本地化页）。

## 五、语言与缓存策略（重要）

- **24 种语言全开**（不设 `VITE_LANGUAGES`）。语言清单来自 `public/locales/*`：
  ar be ca da de en es fa fr id it ja ko nl pl pt ru sk sv tr uk vi zh zh-TW。
- 本地化页面由 `scripts/generate-i18n-pages.mjs` 在构建后生成：
  `/zh/merge-pdf`、`/ja/merge-pdf`、`/es/compress-pdf`、`/zh/about` … 共 3220 个，
  带 `<html lang>`、本地化 title/description、完整 hreflang 与自指 canonical。
- 语言切换器：simple-mode 页脚原本在 i18n 初始化前就挂载，搜索框占位符显示
  `undefined`；现已改为回退文案 + i18n 就绪后重建切换器（24 项，占位符本地化）。
  改动点在 `src/js/i18n/language-switcher.ts`。
- **Service Worker 已停用**（`VITE_ENABLE_SW` 不设置即为关闭），线上 `/sw.js` 是「自杀开关」：
  清空旧缓存、注销自身、刷新一次受控页面。旧版 cache-first SW 曾把旧 HTML 与哈希资源混用，
  导致工具网格偶发空白；不要重新打开，除非改成按版本失效的策略。

## 六、SEO 与搜索引擎收录

已内置的技术 SEO：

- 每页唯一 title/description（工具页含本地化标题），canonical 自指且只有一条。
- 24 种语言 + x-default 的 hreflang 互指，`/zh/…`、`/ja/…` 均有独立 URL。
- `sitemap.xml` 3361 条（工具页 + 本地化页 + about/privacy/guides），`robots.txt` 声明 sitemap。
- JSON-LD：首页 Organization、工具页 SoftwareApplication + HowTo + BreadcrumbList、
  guides 为 Article + BreadcrumbList、about 为 AboutPage。
- Open Graph / Twitter Card（og.png 1200×630）、favicon 全套、404 返回真 404、
  `.html` 自动 308 到无扩展名 URL、http→https 301、HSTS 一年。
- `robots.txt` 只屏蔽 `/locales/`、`/libreoffice-wasm/`、`*.wasm`；
  **不要屏蔽 `/assets/`**，JS/CSS 都在里面，屏蔽后 Google 无法渲染页面。
- pages.dev 与自定义域内容相同，canonical 统一指向 `https://qdxil.qzz.io`。

主动推送收录（无需账号）：IndexNow，key 文件是站点根目录的
`9f3c1d9a7b2e4f6a9c0d1e2f3a4b5c6d.txt`，重新推送：

```bash
curl -s https://qdxil.qzz.io/sitemap.xml -o /tmp/sitemap.xml
node -e "const fs=require('fs');const u=[...fs.readFileSync('/tmp/sitemap.xml','utf8').matchAll(/<loc>([^<]*)<\/loc>/g)].map(m=>m[1]);fs.writeFileSync('/tmp/indexnow.json',JSON.stringify({host:'qdxil.qzz.io',key:'9f3c1d9a7b2e4f6a9c0d1e2f3a4b5c6d',keyLocation:'https://qdxil.qzz.io/9f3c1d9a7b2e4f6a9c0d1e2f3a4b5c6d.txt',urlList:u}))"
curl -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json' --data-binary @/tmp/indexnow.json -w '%{http_code}'
```

返回 200/202 即已接收（会同步给 Bing、Yandex、Naver、Seznam）。Google 不参与 IndexNow，
需要在 Search Console 手动提交一次：

1. https://search.google.com/search-console → 添加资源 → **域名** → `qdxil.qzz.io`。
2. 按提示在 Cloudflare DNS 加一条 TXT（或选用 HTML 文件验证，把文件放进
   `/tmp/opencode/brand/pages/` 后重新 postprocess + deploy）。
3. 验证通过后 → Sitemaps → 提交 `https://qdxil.qzz.io/sitemap.xml`。
4. URL 检查 → 首页与 merge-pdf / compress-pdf / heic-to-pdf 各点一次「请求编入索引」。

预期：新域名无外链，Bing 约 3–7 天开始出现，Google 通常 1–3 周；先用
`site:qdxil.qzz.io` 自查。想加速就补外链（GitHub README、产品目录、相关论坛回答）。

## 七、已知限制与风险

- DNS：CNAME 未添加前 `qdxil.qzz.io` 无法访问（curl 000 / DNS 无记录），
  Pages 侧状态为 `pending / CNAME record not set`。
- COEP: `credentialless`。第三方广告/嵌入若不带兼容头会被拦，
  上 AdSense 前需要单独验证（必要时调整为 `require-corp` 并实测各工具页）。
- 站点无后端，无法做服务端限流/审计；滥用面主要是带宽（Pages 免费额度内）。
- 大文件（LibreOffice 引擎）依赖分片加载 + JS；禁用 JS 的用户只能看到静态文案。
  沙箱出口带宽约 100KB/s，Office→PDF 未做端到端实测（5 个分片与 3 个脚本均已验证 200）。
- 全部工具的结果都在浏览器内存中生成，超大 PDF（>200MB）受设备内存限制。
- R2 未开通（error 10042），所以大文件走分片而不是对象存储；日后开通可简化加载逻辑。

## 八、下一步运营建议

1. 加完 CNAME 后在 Search Console 提交新 sitemap，观察 `/zh/`、`/ja/` 的收录。
2. 内容：围绕「no upload / private PDF」长尾词，每周加 1 篇 guide，内链到对应工具页。
3. 变现：先上 Cloudflare Web Analytics 观察 2 周，再评估 AdSense（注意 COEP/CSP）。
4. 多语言：优先做 zh/ja/es/pt 的落地文案与内链，别只依赖机器翻译。
5. 监控：加一个外部 uptime 检查（首页 + 一个工具页 + 一个 20MB 分片），
   Pages 部署后自动冒烟（本仓库 `scripts/postprocess.mjs` 可复用）。
