# 余音

## 本地启动

项目无需安装第三方依赖，使用 Node.js 直接运行：

```powershell
node server.js
```

打开 `http://127.0.0.1:4174/`。未配置密钥时，搜索接口使用本地演示候选。

本地开发可将密钥放在已被 Git 忽略的 `.env.local` 中，之后直接运行 `node server.js` 即可自动读取，不需要每次在 PowerShell 重复输入。

## 启用 DeepSeek

PowerShell：

```powershell
$env:DEEPSEEK_API_KEY="你的密钥"
$env:DEEPSEEK_MODEL="deepseek-chat"
node server.js
```

密钥只存在服务端环境变量中，不会发送到浏览器。生产部署时应在 Vercel、Netlify 或服务器控制台配置环境变量。项目已为 AI 接口增加基础频率限制、超时和热实例缓存。

模型建议：当前搜索意图识别、候选生成和卡片策展统一使用 `deepseek-chat`，它的结构化 JSON 输出更稳定且成本较低。下一阶段实现古文双重校验时，使用 `deepseek-chat` 独立生成原文，再用 `deepseek-reasoner` 审查存在差异的段落；对应预留变量为 `DEEPSEEK_REVIEW_MODEL`。诗泉无需 API Key，`POETRY_API_BASE_URL` 通常保持默认值即可。

Netlify 配置路径：`Site configuration → Environment variables`。至少添加：

```text
DEEPSEEK_API_KEY = 你的新密钥
DEEPSEEK_MODEL = deepseek-chat
```

保存后进入 `Deploys → Trigger deploy → Deploy site`。古文双模型功能上线后再增加 `DEEPSEEK_REVIEW_MODEL=deepseek-reasoner`。

## 当前流程

1. 用户搜索古代诗人、词人、文学家和作品，或粘贴自己有权使用的古风歌词。
2. 后端调用 DeepSeek 识别候选作品；诗、词、曲再通过诗泉按作者、标题和代表性原句精确匹配完整原文，未匹配内容继续标记为待核验。
3. 用户选择作品后，可选择“AI帮选”或“全文自选”；全文自选支持关键词筛选、折叠作品、只看已选，并从完整原文中选择和排序4-9句。歌词由用户从AI候选中选择4-9句。
4. 用户调整模板、A/B构图、画幅、简繁、背景和单句样式。
5. 作品自动保存到浏览器最近10张历史，最终通过纯净预览和系统截图保存。

## 前端结构

- `index.html`：页面结构和资源入口。
- `styles/app.css`：界面、模板、艺术背景和响应式样式。
- `src/poster.js`：卡片渲染和文字适配。
- `src/storage.js`：草稿、撤销和最近作品。
- `src/editor.js`：句子微调。
- `src/layout.js`：句子自由拖拽、放缩、碰撞约束和自定义布局。
- `src/controls.js`：模板、背景、画幅和移动端控制。
- `src/discovery.js`：内容搜索、策展和歌词入口。
- `src/app.js`：最小启动入口。
- `src/api.js`：浏览器端 API 请求。
- `api/_poetry-source.js`：诗泉全文查询、精确匹配、缓存与来源标记。

诗泉精确匹配的内容标记为“诗泉原文”；未匹配的模型候选仍标记为“待核验”，并保留用户编辑和确认步骤。
