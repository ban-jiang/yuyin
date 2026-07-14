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

## 当前流程

1. 用户搜索古代诗人、词人、文学家和作品，或粘贴自己有权使用的古风歌词。
2. 后端调用 DeepSeek 返回古诗词、古文或歌词候选，并进行作者、体裁和原句约束。
3. 用户选择作品后，可选择“AI帮选”或“自己选句”；手选支持从多篇作品中选择并排序4-9句。歌词由用户从AI候选中选择4-9句。
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

模型候选目前标记为“待核验”。正式上线前应接入可靠原文检索来源，或保留用户编辑和确认步骤。
