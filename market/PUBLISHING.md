# 发布到 dshmarket：剩余步骤

dshmarket 的「发现」页读的是社区目录 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)；
插件要出现在市场里，需要在那个仓库加一条条目。截图和图标都在本仓库里，目录构建时按下面的约定读取。

## 现状核对

| 要求 | 状态 |
|---|---|
| 仓库公开 + `package.json` 声明 `dsh.bundle` | 满足 |
| 仓库创建满 1 天 | 满足（2026-11-21 创建） |
| 仓库带 `dsh-plugin` topic | 满足 |
| MIT 许可 | 满足 |
| `icon.png`（GitHub 托管位图，180×180） | 满足 |
| `screenshots.json` + `docs/screenshots/*.png` | 满足（3 张，PNG） |
| 本地提交已推送 | **未完成**（本地领先远端） |

## 第 1 步：推送

```sh
git push origin main
```

推送后再确认这三个 URL 能打开（目录构建会读它们）：

- https://raw.githubusercontent.com/EonCosmos/dsh-pure-chat/main/icon.png
- https://raw.githubusercontent.com/EonCosmos/dsh-pure-chat/main/screenshots.json
- https://raw.githubusercontent.com/EonCosmos/dsh-pure-chat/main/docs/screenshots/01.png

## 第 2 步（可选，建议）：发布到 npm

市场对 npm 包会展示下载量，安装时也免走源码构建。**不影响收录**，可跳过。

```sh
npm login                        # 需要 npm 账号；开了 2FA 时加 --otp=123456
npm publish --dry-run            # 会先跑测试；确认 pack 清单
npm publish
```

发布后按目录评审的惯例自查（新包名有时会短暂不可用）：

```sh
npm view dsh-pure-chat dist-tags.latest     # 应等于 1.5.2
npm view dsh-pure-chat dist.tarball         # 应能下载
```

国内镜像可能滞后并把 `latest` 显示成 `0.0.0-stage`，可让它重新抓取：
`curl -X PUT https://registry.npmmirror.com/dsh-pure-chat/sync`，等几分钟再装一次验证。

## 第 3 步：给目录提 PR

1. Fork 并 clone `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`。
2. 把本目录的 `EonCosmos__dsh-pure-chat.yml` 复制到 `data/plugins/EonCosmos__dsh-pure-chat.yml`
   （**文件名保留大小写**，目录的 slug 规则如此）。
3. 本地自查（跑的就是 CI 那套校验）：

   ```sh
   npm ci && node scripts/generate-readme.mjs
   ```

4. 提交并开 PR，标题与正文可用：

   **标题**：`Add EonCosmos/dsh-pure-chat`

   **正文**：

   > Adds `EonCosmos/dsh-pure-chat`: a plain-chat agent preset (no system prompt,
   > no host-global tools) that mounts `web_search`, `web_fetch` and `write_file`
   > (txt/md/doc/xls/pdf), plus a clear-context control and a question jumper.
   > The repository declares `dsh.bundle`, ships `icon.png` and lists three
   > screenshots in `screenshots.json`.

一个 PR 最多 3 条；CI 会检查 `dsh.bundle`、仓库年龄、条目格式与 README 能否重新生成，维护者会读代码核对描述。

## 第 4 步：合并后验证

- 目录夜间重建后，在 dshmarket 的「发现」里搜 `dsh-pure-chat`，确认卡片有图标、详情页按
  `screenshots.json` 的顺序显示 3 张截图。
- 之后改截图只需推本仓库的 `docs/screenshots/` 与 `screenshots.json`，不用再提 PR；
  改图标同理（`icon.png`）。

## 规则备忘

- 市场截图/图标只接受**位图**（png/jpg/jpeg/webp），**不收 SVG**；必须 GitHub 托管
  （`raw.githubusercontent.com` 等）；截图 1–8 张，路径相对 `screenshots.json` 且不得越出仓库。
- 条目里不写 `screenshots`：截图由本仓库的 `screenshots.json` 提供。
- 不写 `npm:` 字段：npm 包通过 `package.json` 的 `repository` 自动关联。
- 分类现在选的是 `ui`（可见的是两个界面控件）；若维护者认为 `workflow` 更贴切，他们会直接改，
  不会打回。