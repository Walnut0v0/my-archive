import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
const [indexPath, outPath] = process.argv.slice(2);
if (!indexPath || !outPath)
  throw new Error(
    "用法: node scripts/backup-images.mjs <archive.json> <备份目录>",
  );
const archive = JSON.parse(await readFile(indexPath, "utf8"));
await mkdir(outPath, { recursive: true });
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
for (const entry of archive.entries)
  for (const image of entry.images) {
    if (!/^[a-f0-9-]+$/.test(image.id)) throw new Error("图片 ID 无效");
    const ext =
      {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      }[image.mime] || "bin";
    const output = path.resolve(outPath, image.id + "." + ext);
    const result = spawnSync(
      process.execPath,
      [
        wrangler,
        "r2",
        "object",
        "get",
        "archive-images/" + image.id,
        "--remote",
        "--file",
        output,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error("图片获取失败: " + image.id);
  }
console.log("图片备份完成。请同时保存 archive.json。");
