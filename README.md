# TmpPrompt

一个轻量匿名工具：把长文本和截图整理成临时上下文页，再把公开链接或 Raw 文本交给 Codex。

## 协作约定

- 这个项目后续默认使用中文沟通。
- 文档、界面文案、开发说明与交付内容，均以中文优先。
- 只有在代码标识、协议字段、第三方接口或外部工具要求时，才保留必要英文。

## 技术栈

- `apps/web`: Vite + Vue 3 + TailwindCSS
- `apps/server`: Fastify + SQLite（`sql.js` 单文件持久化）+ `jimp`
- `packages/shared`: 共享常量、导出逻辑、文案映射

## 当前这版能力

- 匿名创建文档
- 浏览器本地保存 `edit_token`，用于继续编辑和删除
- 首页公共文档列表
- 单文档式编辑区
- 截图粘贴、拖拽上传、图片压缩
- 自动保存、未保存提醒、离页确认
- 公开页、Raw 文本页
- 默认公开列表，24 小时自动过期
- stone 工具风浅色 / 深色主题

## 目录结构

```text
apps/
  server/
  web/
packages/
  shared/
```

## 本地运行

```bash
pnpm install
pnpm dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 构建

```bash
pnpm build
```

## 本地存储

服务端数据都保存在 `apps/server/` 下，并且已加入 `.gitignore`：

- `data/tmpprompt.sqlite`
- `uploads/`
- `tmp/`

## API 草图

- `POST /api/documents`
- `GET /api/documents`
- `GET /api/documents/:slug`
- `PUT /api/documents/:slug`
- `DELETE /api/documents/:slug`
- `POST /api/uploads`
- `GET /p/:slug/raw`

## 说明

- 项目默认没有用户体系。
- 编辑权限完全依赖创建时发到浏览器里的 `edit_token`。
- 当前图片压缩输出为 `jpg`，是为了保证本地依赖更轻、开箱即跑；后面如果部署环境稳定，可以再切成 `webp`。
- 更细的协作与贡献规则请查看 `AGENTS.md`。
