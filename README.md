# RhysAlex

个人项目与技术学习记录。公开网站部署在 https://rhysalex.github.io ，写作后台独立运行在 Cloudflare Workers。暖白与淡橙配色，没有预置文章。

## 日常写作

在写作后台用站长 GitHub 账号登录。导入 Markdown、上传配图、预览、保存草稿或发布。只有 GitHub 数字用户 ID `249475921` 可以管理内容；隐藏后台链接不是权限控制。

点击发布后，后台保存固定的发布版本并触发 GitHub Actions。等进度显示“网站已更新”后，修改才在公开网站生效。任务失败时可以重试该版本。撤回与删除已发布文章同样需要等待网站更新。其他草稿不会进入发布版本。

## 架构

- `src/`：Astro 静态网站，项目、文章、分类和本地全文搜索。
- `admin/`：React 写作界面，独立构建，绝不上传到 GitHub Pages。
- `backend/`：Worker API、GitHub 登录、私有会话、内容和图片管理、发布版本。
- `.github/workflows/pages.yml`：获取指定版本，复制图片，构建并部署 Pages，回报状态。
- `scripts/`：内容导出、构建检查，以及本机账号配置辅助程序。

文章、草稿、登录会话和配图保存在 Cloudflare D1。图片分块保存，单张不超过 5 MB、上传总量上限 100 MB；当前不使用 R2，不需要开通 R2 计费。未使用的历史图片仍计入容量，不自动删除以避免破坏历史发布版本；接近限额时可维护清理或迁移。

公开网站与配图独立存放在 Pages，日常访客不需要访问后台。发布内容来自授权导出的固定版本，不会把数据库、草稿、会话或密钥上传到公开仓库。原始 HTML 不参与 Markdown 渲染。

## 本地开发

Node 22.13+。`npm ci` 后：

- `npm run dev`：公开网站预览。
- `npm run build`：生成公开网页（没有导出文件时仅生成空站）。
- `npm run build:admin`：构建后台页面。
- `npm run dev:backend`：运行独立后台。先用 Wrangler 应用本地 D1 migrations。
- `npm run check`、`npm test`：类型检查和隔离的数据库/API 集成测试。
- `node scripts/check-static.mjs`：检查公开构建不含后台、凭证或原托管平台地址。

测试使用临时数据库和模拟 GitHub 响应，不绕过生产登录，也不写入线上内容。

## 部署配置

后台：`backend/wrangler.jsonc` 保存非敏感部署配置，`npm run deploy:backend` 发布。数据库迁移使用 `wrangler d1 migrations apply DB --remote --config backend/wrangler.jsonc`。

后台 Secrets：

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`：网站专用 GitHub App 登录。
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_INSTALLATION_ID`：短期发布令牌，只限定网站仓库。
- `BUILD_TOKEN`：GitHub Actions 从后台读取发布版本及回报结果的专用凭证。

GitHub 仓库设置：Pages 来源选 GitHub Actions；Actions 变量 `BACKEND_URL` 指向后台；Actions Secret `BUILD_TOKEN` 与后台一致。接通后台后将 `site.config.json` 的 `backendRequired` 改为 true，防止配置遗漏时用空站覆盖已发布内容。

GitHub App 由站长拥有，只安装到网站仓库，权限为 Contents read、Actions write。不需要让后台持有站长个人账号的完整访问令牌。

## 维护

新文章和图片通过后台发布。新增模块、改版和搜索功能在源码中修改，经检查后推送 main 自动部署。源码更新取最近成功发布的内容版本；不会自动公开尚未发布的修改。

不要提交 `.env*`、`.dev.vars*`、`.content/`、本地数据库或导出的草稿。部署前保留上一成功版本便于回退。
