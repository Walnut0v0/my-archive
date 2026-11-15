# 拾藏 · 我的私人档案

一个用于个人收藏的网站。React + TypeScript + Cloudflare Workers / D1 / R2，使用原生 workers.dev 地址。

- 单列时间流；物料、同人文、同人图三个分类
- 新增、编辑、删除收藏；标题、作者、原帖、备注、自定义标签
- 搜索标题、作者、标签、备注及正文；分类、标签、日期筛选
- 图片上传、缩略图、键盘切换查看器、原图下载
- 同人文纯文本存档与 TXT 导入；沉浸式阅读、字号、行距、夜间背景
- 特别喜欢；原帖跳转和复制链接
- 密码解锁，登录保持 180 天；不需要邮箱或 Access
- 手机和电脑读取同一份云端档案；添加到主屏幕
- 文字索引导出，以及含图片的 ZIP 导出（图片总量 300 MB 内）

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

图片空间在数据库中原子记账，上限 8,000,000,000 字节。单张最多 15 MB，支持 JPEG / PNG / GIF / WebP，不自动压缩原图。R2 的开通、免费额度与账单以 Cloudflare 控制台为准，代码中的容量限制不是账单上限。

## 验证

```powershell
npm run build
npm test
```

集成测试使用独立的本地 Worker / D1 / R2，覆盖密码登录、收藏增删改查、正文搜索、标签、图片读写与导出，不接触线上收藏。
