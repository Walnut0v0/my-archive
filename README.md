# 拾藏 · 我的私人档案

一个用于个人收藏的网站。React + TypeScript + Cloudflare Workers / D1 / R2，使用原生 workers.dev 地址。

## 当前部署

- 网站：<https://my-archive.c3066872744.workers.dev/>
- 首次上线：2026-11-20（Asia/Manila）
- Worker：`my-archive`；D1：`archive-db`；R2：`archive-images`（私有）
- 解锁密码和登录签名密钥已作为 Worker Secret 配置，不在仓库中保存。
- 生产构建、独立本地集成测试通过；Cloudflare 已确认当前版本以 100% 流量发布。
- 发布时执行环境的网络无法正常解析并访问 workers.dev，尚未完成公网端到端验证。

后续更新可运行 `npm run deploy`。当前没有配置 GitHub 推送后自动部署。

- 单列时间流；物料、同人文、同人图三个分类；按收藏时间或发布日期排序，支持年份分组
- 新增、编辑、删除收藏；标题、作者、多平台多链接、独立备份链接、备注、自定义标签
- 搜索标题、作者、标签、备注及正文；分类、标签、日期筛选
- 图片与视频上传、Ctrl+V 粘贴剪贴板文件、缩略图、键盘切换查看器、原文件下载
- 同人文纯文本存档与 TXT 导入；沉浸式阅读、字号、行距、夜间背景
- 特别喜欢；各平台原帖、备份链接跳转和复制；粘贴链接后尝试读取标题，失败时可手动填写
- 密码解锁，登录保持 180 天；不需要邮箱或 Access
- 手机和电脑读取同一份云端档案；添加到主屏幕
- 文字索引导出，以及含附件的 ZIP 导出（附件总量 300 MB 内）

## 本地开发

需要 Node.js 22+。

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:local
npm run build
npm run preview
```

打开 Wrangler 输出的本地地址。`.dev.vars` 中的 DEV_MODE 只对回环地址生效。开发前端热更新时另开终端执行 `npm run dev`，前端会将 API 转到 8787 端口。

## 部署

1. `npx wrangler login --device` 登录自己的 Cloudflare。
2. 创建 D1 数据库 `npx wrangler d1 create archive-db`，将返回的 ID 填入 `wrangler.jsonc` 的 `database_id`。当前仓库的 ID 已指向本项目数据库。
3. 在 Cloudflare 控制台启用 R2，再运行 `npx wrangler r2 bucket create archive-images`。保持桶私有。
4. `npm run db:remote` 建表。
5. `npx wrangler secret put ARCHIVE_PASSWORD` 设置解锁密码。
6. `npx wrangler secret put SESSION_SECRET` 设置一段随机的长字符串，作为登录签名密钥。
7. `npm run deploy` 构建并部署。Worker 名称是 `my-archive`，在所属账号的 workers.dev 子域名下提供服务。

不设置密码和签名密钥时，收藏 API 不会开放。不要在 Cloudflare 生产环境添加 `DEV_MODE`。不使用 Access，亦不需要购买域名。

如连接 Workers Builds：构建命令 `npm run build`，部署命令 `npx wrangler deploy`，根目录 `/`。Secret 在 Worker 设置中保留，不能写进 GitHub。

## 备份

设置页面可以导出 JSON（全部正文与元数据）或 ZIP（包含图片文件）。ZIP 中图片按图片 ID 命名，`archive.json` 可对应原始文件名和收藏。

大于 300 MB 的图片档案请使用命令行备份，避免浏览器打包占用过多内存：

1. 网站设置中导出文字与索引为 `archive.json`。
2. `node scripts/backup-images.mjs C:/你的目录/archive.json C:/你的备份目录`。
3. 脚本通过 Wrangler 的登录账号逐张获取私有 R2 原图。备份时需要保持 Cloudflare 登录。完整迁移目前需要按 JSON 重新导入数据库，本版本没有界面导入功能。

附件空间在数据库中原子记账，上限 8,000,000,000 字节。图片最多 15 MB，支持 JPEG / PNG / GIF / WebP；视频最多 50 MB，支持 MP4 / WebM，播放器支持 Range 请求。保留原始文件，不自动压缩。R2 的开通、免费额度与账单以 Cloudflare 控制台为准，代码中的容量限制不是账单上限。

## 验证

```powershell
npm run build
npm test
```

集成测试使用独立的本地 Worker / D1 / R2，覆盖密码登录、收藏增删改查、正文搜索、标签、图片读写与导出，不接触线上收藏。

## 平台、日期和标签

原帖存为 `links: [{platform, url}]`，`backup_url` 单独保存备份地址。旧的 `url` 自动迁移，仍保留首个链接以便兼容备份。物料／同人图预设小红书、微博、bilibili、豆瓣，同人文预设微博、Lofter、AO3、小红书；也可添加其他平台，同平台可放多条链接。

`published_date` 使用 YYYY、YYYY-MM 或 YYYY-MM-DD 保存用户填写的精度。辅助区间用于排序与日期筛选，界面保留原精度；年份、月份与筛选日期相交时均会匹配。未填写发布日期的记录排列在发布日期时间线末尾。

标签按物料与同人分为两组，同人文和同人图共用同人标签；新增建议、侧边栏计数和标签筛选都按组区分，同名标签也不会跨组混查。已有记录按当前分类自动归组，无须迁移。标签支持回车逐个添加、点选已有标签、点击删除，不需要逗号。支持表单内 Ctrl+V 粘贴浏览器能读取的图片或视频文件，视频网址请存为平台链接。

标题读取通过已登录接口获取公开页面的 Open Graph 标题或 HTML 标题，最多读取 256 KB，并有超时限制。登录墙、反爬拦截或无法访问的页面需要手动填写，不会覆盖已填写的标题。
