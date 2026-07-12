# 余音

## 本地启动

项目无需安装第三方依赖，使用 Node.js 直接运行：

```powershell
node server.js
```

打开 `http://127.0.0.1:4174/`。未配置密钥时，搜索接口使用本地演示候选。

## 启用 DeepSeek

PowerShell：

```powershell
$env:DEEPSEEK_API_KEY="你的密钥"
$env:DEEPSEEK_MODEL="deepseek-chat"
node server.js
```

密钥只存在服务端环境变量中，不会发送到浏览器。生产部署时应在 Vercel、Cloudflare 或服务器控制台配置环境变量，并对 `/api/search` 增加频率限制。

## 当前流程

1. 用户用自然语言描述诗人、作品、名句或情绪。
2. 后端调用 DeepSeek 返回结构化候选。
3. 用户选择作品，并确认 1-3 条核心句。
4. 其余候选句作为支撑句进入模板系统。
5. 用户调整模板、简繁和背景色后使用浏览器截图或打印/PDF保存。

模型候选目前标记为“待核验”。正式上线前应接入可靠原文检索来源，或保留用户编辑和确认步骤。
