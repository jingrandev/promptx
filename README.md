# TmpPrompt

一个轻量匿名工具：把需求描述、上下文文本和截图整理成临时页面，再把公开链接或 Raw 文本交给 Codex 等模型继续使用。

## 项目定位

- 不引入登录和账号体系，默认匿名使用。
- 编辑权限依赖浏览器本地保存的 `edit_token`。
- 公开文档默认进入首页列表，并在 24 小时后自动过期。
- 优先服务“临时整理需求并交给模型继续开发”这个场景，不追求复杂协作能力。

## 当前能力

- 创建匿名文档并自动生成可分享链接
- 首页查看最近公开文档列表
- 编辑页支持纯文本块、导入文本块、图片块混排
- 支持粘贴截图、拖拽图片、选择图片上传
- 支持导入 `.md`、`.markdown`、`.txt` 文本文件
- 自动保存、离页未保存提醒、快捷键保存
- 公开页查看和 Raw 文本导出
- 浅色 / 深色主题切换

## 技术栈

- `apps/web`: Vite + Vue 3 + Vue Router + TailwindCSS
- `apps/server`: Fastify + `sql.js` + `jimp`
- `packages/shared`: 共享常量、块类型、导出和标题提取逻辑
- `pnpm workspace`: 管理多包仓库

## 目录结构

```text
apps/
  server/
    src/
  web/
    src/
packages/
  shared/
```

主要模块说明：

- `apps/web/src/views`: 页面级视图，如首页、编辑页、公开页
- `apps/web/src/components`: 编辑器、通知、主题切换等组件
- `apps/web/src/lib`: API 请求、编辑凭证存取等工具函数
- `apps/server/src/index.js`: Fastify 入口与 HTTP 接口
- `apps/server/src/repository.js`: 文档和块数据读写
- `apps/server/src/db.js`: 本地 SQLite 初始化与持久化封装
- `packages/shared/src/index.js`: 前后端共享常量和文档导出逻辑

## 本地开发

安装依赖：

```bash
pnpm install
```

启动前后端开发环境：

```bash
pnpm dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 构建与检查

构建整个工作区：

```bash
pnpm build
```

运行占位 lint：

```bash
pnpm lint
```

当前仓库还没有完整自动化测试。提交前至少建议完成：

1. 运行 `pnpm build`
2. 运行 `pnpm dev` 做基础冒烟验证
3. 手动验证创建文档、编辑保存、上传图片、导入文本文件、公开页访问、Raw 导出

## 数据与本地文件

服务端运行时数据默认放在 `apps/server/` 下：

- `data/tmpprompt.sqlite`: SQLite 数据文件
- `uploads/`: 上传后的图片文件
- `tmp/`: 临时处理中间文件

这些目录和文件不应提交到仓库。

## API 概览

- `POST /api/documents`: 创建文档
- `GET /api/documents`: 获取公开文档列表
- `GET /api/documents/:slug`: 获取文档详情
- `PUT /api/documents/:slug`: 更新文档
- `DELETE /api/documents/:slug`: 删除文档
- `POST /api/uploads`: 上传并压缩图片
- `GET /p/:slug/raw`: 获取文档 Raw 文本

## 使用说明

1. 在首页创建新文档。
2. 在编辑页输入需求文本，或直接粘贴截图、拖入图片和文本文件。
3. 自动保存完成后，复制公开页链接或 Raw 文本链接给模型。
4. 如果需要继续编辑，必须保留当前浏览器里的 `edit_token` 本地记录。

## 当前限制

- 没有用户体系和多人协作能力
- 过期策略当前固定为 24 小时
- 可见性当前固定为公开列表
- 图片上传后统一压缩为 `jpg`
- 文本文件导入当前仅支持纯文本类文件，不包含 PDF 解析

## 协作约定

- 默认使用中文沟通。
- 文档、界面文案、开发说明和交付内容以中文优先。
- 只有在代码标识、协议字段、第三方接口或外部工具要求时保留必要英文。

更细的仓库协作规则请查看 `AGENTS.md`。
