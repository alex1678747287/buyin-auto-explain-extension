# AGENTS.md

## 项目概览

这是一个独立 Chrome Extension 项目，用于抖音电商百应直播商品控制页，按可配置间隔自动点击“讲解/取消讲解”。

## 常用命令

```bash
npm test
npm run check
```

项目没有构建步骤，也不需要提交锁文件。

## 目录结构

- `manifest.json`：Chrome Manifest V3 配置。
- `src/automation-core.js`：可测试的核心 DOM 选择和配置归一化逻辑。
- `src/content.js`：注入百应页面的运行循环。
- `src/popup.html` / `src/popup.css` / `src/popup.js`：扩展弹窗 UI 和设置保存。
- `test/automation-core.test.js`：Node 内置测试，覆盖核心选择规则。

## 验证要求

- 修改核心选择逻辑后运行 `npm test`。
- 修改运行脚本或 popup 后运行 `npm run check`。
- 涉及真实百应页面结构时，应在 Chrome 加载未打包扩展后做手动烟测。

## 变更边界

- 不写入账号、Cookie、token 或直播间私密信息。
- 不扩大 `manifest.json` 权限范围，除非有明确需求和说明。
- 不提交构建产物、日志、缓存或锁文件。
