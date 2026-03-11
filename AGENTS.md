# Repository Guidelines

## 沟通约定

- 这个项目后续默认使用中文沟通。
- 生成的说明、文档、界面文案、开发备注与交付内容，均以中文优先。
- 只有在第三方接口、代码标识、协议字段或外部工具要求英文时，才保留必要英文。

## 项目结构与模块划分

本仓库使用 `pnpm workspace` 管理，主要分为三部分：

- `apps/web`：前端应用，基于 Vite + Vue 3。页面放在 `src/views`，组件放在 `src/components`，工具函数在 `src/lib` 和 `src/composables`。
- `apps/server`：后端服务，基于 Fastify。入口在 `src/index.js`，数据访问在 `src/repository.js`，本地数据库封装在 `src/db.js`。
- `packages/shared`：前后端共享常量和辅助函数，例如过期策略、可见性与 Raw 导出逻辑。

前端构建产物在 `apps/web/dist`。本地运行数据位于 `apps/server/data`、`apps/server/uploads`、`apps/server/tmp`，不要提交。

## 构建、测试与开发命令

- `pnpm install`：安装工作区依赖
- `pnpm dev`：同时启动前端和后端开发环境
- `pnpm build`：构建前端并执行工作区构建脚本

示例：

```bash
pnpm install
pnpm dev
```

## 代码风格与命名规范

- 使用 2 空格缩进。
- 默认使用 ASCII；若现有文件或中文文案需要，可使用中文。
- Vue 组件文件使用 PascalCase，例如 `DocumentCard.vue`。
- 工具模块使用小写或 camelCase，例如 `api.js`、`useTheme.js`。
- 样式采用 Tailwind 优先，并保持既定 stone 工具风：`rounded-sm`、主结构实线边框、次级强调使用虚线边框。
- 共用逻辑优先放入 `packages/shared`，避免前后端重复实现。

## 测试要求

当前还没有完整自动化测试，提交前至少完成以下检查：

- 运行 `pnpm build`
- 使用 `pnpm dev` 做基础冒烟验证
- 手动检查核心流程：创建文档、编辑保存、上传图片、打开公开页、访问 Raw 导出

后续新增测试时，建议放在功能附近或 `__tests__` 目录，并使用 `*.test.js` 命名。

## 提交与合并请求规范

当前目录没有可参考的 Git 历史，默认采用简洁的 Conventional Commits 风格：

- `feat: 增加自动保存状态提示`
- `fix: 修复过期文档返回逻辑`

PR 应包含：

- 变更目的和范围
- 涉及模块，例如 `apps/web`、`apps/server`
- 手动验证步骤
- UI 变更截图或录屏

## 安全与配置说明

- 不要提交数据库文件、上传文件、临时目录或 `.env`。
- 项目默认是匿名模式，不要在未讨论前引入登录、权限系统或复杂鉴权。
- 涉及编辑能力时，保留并理解现有 `edit_token` 机制，避免破坏匿名编辑流程。
