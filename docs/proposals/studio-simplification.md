# VisDelta / Studio 修剪计划

日期：2026-11-02。状态：五批实现与本地验收已完成。
这是一份内部执行清单，不是新增公共指南，也不描述尚未实现的能力。

## 目标与边界

VisDelta 是独立可用的可视化引擎。Studio 包含四个入口：

| 入口 | 保留的职责 | 不继续建设 |
| --- | --- | --- |
| Gallery | 静态 chart idiom showcase；最小声明、数据、进入编辑 | 第二套编辑器或动画实验室 |
| Playground | 图表实时编辑、预览、状态与过渡调试 | 通用网站 IDE |
| Story | 少量可复制的 scrollytelling 网站范例，展示高效渲染和公共 API | 独立叙事语言、通用 MDX 编辑平台 |
| Liveshow | 公共 API 的 MCP 包装，展示实时修改与反馈 | 第二套图表编译器、语义规则与验证器 |

Greenfield 原则：直接替换旧 API、参数和文档；不保留同义入口、旧格式适配或过渡开关。
必要的错误处理、取消、身份追踪、事务验证不是兼容代码。代码退役也不意味着删除用户草稿、数据或凭据。

目标依赖：Studio → VisDelta 公共 API。主库不依赖 Studio、MDX、MCP、模型提供方或语音。
先减少概念和实现，再整理仓库；不预先引入公共 Studio SDK、插件系统或通用编辑器框架。

## 现场盘点

当前主库工作树已有大量未提交改动，两个应用也有独立工作。以下条目是针对当前文件的修剪决策，不授权覆盖这些已有成果。

| 对象与当前位置 | 决策 | 具体处理与完成证据 |
| --- | --- | --- |
| 主库 `src/grammar`、`src/runtime`、`src/charts` | 保留 | 继续区分通用运行时和图表语义；不因目录多就合并。身份、可逆播放、轴清理、原子更新回归必须保留 |
| `src/charts/unit/authoring.ts` 的 `radius()`、`layout({radius})` | 删除兼容入口 | 统一 `.size()`；修改所有调用、类型、示例与文档；旧入口不再导出或静默接受 |
| `src/spec-meta.ts` 与各 chart state 的旧 selection/focus 表达 | 核实后收敛 | 列出每个读写者，区分 builder 输入和真正历史别名；只删除后者，不能用全文替换破坏内部编译阶段 |
| `src/charts/bar/edit.ts` 与其他模块 edit adapter | 收敛 | 复用公共语义与验证；不重新引入按 layout 名称禁用独立编辑的逻辑；只在语义相同处共享实现 |
| `website/components/interactive/gallery-idioms.js`、`corpus.ts` | 保留并统一源数据 | 一个 idiom 定义数据和最小声明，Gallery 静态展示，Playground 直接打开同一声明 |
| `website/components/playground/demos.ts`、`website/examples/registry.ts` | 合并重复声明 | 过渡步骤仍属于 Playground；不要把静态 idiom 强制变成 keyframe。仅共享确实相同的数据、声明和元信息 |
| `website/components/story-entry.tsx`、Story/Liveshow 跳转页 | 随整合删除 | 四入口变为 Studio 内部路由；先使新入口可用，再删除中转和旧草稿迁移界面；不创建新 redirect 链 |
| Story `components/story/scroll.ts`、`playback.ts` | 提炼到范例所需的最小实现 | 优先使用公共 transition/sequence/seek/lifecycle；证明无需重新渲染整页即可控制图表，避免再包一套播放 API |
| Story `compiler.ts`、`variables.ts`、`bindings.tsx`、`story-model*` | 用范例替代通用机制 | 原生页面组件、普通状态和 VisDelta 声明优先。parser 只有在保留范例不可避免地需要它时留下，并限制输入范围 |
| Story `story-studio.tsx`、`components/studio/sidebar.tsx`、`tailwind-preview.tsx`、独立 code editor | 退役候选 | 保留“看完整网站、读源码、复制使用”；去掉第二个通用创作 IDE 和运行时样式编译。先迁出范例中的独立价值 |
| Story weather 数据、分析和页面 | 保留内容，剪基础设施 | 保留数据来源、缺失值语义、完整叙事；先将已有天气案例改造成普通网站范例，不额外造新案例平台 |
| Liveshow `server/mcp.mjs`、browser bridge、receipts | 保留并变薄 | transport schema 映射到公开 API；最终图表合法性由主库负责。保留 revision、取消、失败原子性和实际浏览器回执 |
| Liveshow `server/chart-authoring.mjs`、`design-advice.mjs` | 审计重复规则 | 删除重复字段/layout 判定及应用补丁；保留传输边界和应用意图。建议保持 advisory，不另造强制审批状态机 |
| Liveshow 多模型/多语音路径 | 收敛默认示范 | 保留一条实际验收过的文本与语音路径；OpenRouter fallback、GPT-Live 旧模式列为退役项。MCP 本身不绑定模型提供方 |
| 三处独立导航、文档搜索和网站 shell | 合并 | 一个 Studio shell 和公共文档入口；Liveshow 服务端仍单独运行，密钥不进入静态构建 |
| 两应用 `vendor/*.tgz`、Liveshow `visdelta-sync.mjs` | 随同仓库整合删除开发同步层 | 开发使用 workspace 公共 exports；CI 继续真实 pack/install 验证，避免私有源码依赖。历史冻结包只作验收记录 |

## 文档：一份内容，多种输出

现场数量：主库 `docs/` 有 26 个 Markdown/MDX，官网正文 40 个，Story 独立正文 9 个，Liveshow `docs/visdelta/` 有 5 个。数量不是删除指标，重复解释和过期契约才是。

目标：`website/content/docs/` 承载公共文档唯一可编辑正文；网站、npm 随包 Markdown、LLM 文本由同一来源生成。内部架构和验证记录留在维护者目录，不能混入用户学习路径。

| 当前对象 | 动作 |
| --- | --- |
| `docs/index.md` 的旧 Vue 组件首页及旧 `.html` 页面体系 | 迁出仍有价值的独有内容后删除；不再维护旧网站源 |
| `website/scripts/postbuild.mjs` 的 22 个 legacy redirects | 删除重定向生成与对应兼容测试；同步修正仓库内链接和构建命令 |
| `docs/reference.md` 与官网 API/指南重复正文 | 逐节建立映射，合并到官网正文；reference 改为生成物，不再手工追加 |
| `docs/chart-types.md`、`data-sources-and-transforms.md`、随包文档 | 从相同文档源生成版本匹配产物，保留离线/agent 可读取能力 |
| `docs/language-framework.md` | 保留内部设计约束，去掉旧页面组件；用户指南只解释完成任务所需概念，不复制一份宪法 |
| `docs/liveshow-feedback.md`、各 audit/regression/validation 日志 | 移至内部工程记录，退出公共 API 索引；历史证据不冒充当前接口说明 |
| Story 9 页文档及 `docs/authoring.mdx` | 以一个 Story 入口说明加各完整范例 README 替代，删除退役 DSL 的参考文档 |
| Liveshow `docs/visdelta/` 主库副本 | 删除手工/同步副本，读取所安装包的公共版本化文档；场景说明只链接，不重述图表规则 |
| Liveshow README 中互相矛盾的语音说明 | 按保留实现重写，删除“尚未实现语音”和历史模式切换叙述 |

公共学习顺序：快速开始 → 图表声明 → 更新与播放控制 → Idioms → Story / MCP 范例 → API reference。
七类变化作为解释和调试工具保留，不成为用户画第一个图的先修课。

## 执行批次

每批同时修改实现、调用者、文档、相关测试，不先加兼容层等待以后删除。

1. **低耦合清理。** 删除 Unit radius 同义入口、旧网站 redirect 机制；修正其调用、测试和内部链接。核验公共导出、Unit 几何与网站构建。暂不移动仓库。
2. **文档单源。** 迁移公共正文，更新 `scripts/build-dist.mjs` 和文档消费测试，使包和网站读到同一内容；删除旧正文及下游副本。验收安装包可离线读取、无过期接口、无断链。
3. **Story 范例化。** 用已有简单案例和天气案例建立两个普通网站范例，再退役通用编辑器、变量语言及重复文档站。验收正反滚动、seek、resize、无无效重建、离开页面资源释放；范例可脱离 Studio 使用。
4. **Liveshow 薄包装。** 收敛 transport、模型演示和语音路径，删重复语义及旧模式。验收文本/语音进入同一编辑通道、stale revision、批次失败、浏览器回执；保留用户可见错误和调试信息。
5. **Studio 整合。** 将已剪薄的入口收进 `website/`，保持现有主库 `src/` 和 npm exports；暂不为目录对称搬成多包框架。Gallery/Playground 共享声明，Story 提供范例，Liveshow 挂接独立服务端。配置 workspace 和一次本地启动入口，删除 tarball 开发同步及独立 shell。

最终目录意图（不是先建空目录的任务）：

```text
src/                         VisDelta 引擎
website/                     官网、文档、Studio 四入口
examples/story/              少量自包含 scrollytelling 网站
integrations/mcp/            薄 MCP 服务与必要的 browser bridge
tests/                       引擎与集成行为证据
```

示范模型客户端与语音 UI 属于 Studio；MCP transport 不依赖它们。只有真实独立消费需求出现时才把 MCP 单独发包。

## 验收与删减纪律

- 给每批提交列出删除的公共概念、入口和维护副本；新增抽象必须解释比直接代码少了什么负担。
- 不为了统一而把所有图表方法都塞入一个通用巨型适配器。
- 单元测试验证契约；浏览器验证实际图形、对象身份、轴和生命周期；安装包验证独立消费。删除旧接口断言，保留行为断言。
- Story 不要求用户安装/学习额外叙事 DSL；Liveshow 不要求用户学习一套重新命名的图表 API。
- Gallery 不持续播放或在空闲时反复渲染；进入 Playground 后声明、数据、颜色一致。
- 不保留旧 API 的 warning shim、旧模式环境开关、旧 URL 重定向或旧文档双写。数据安全和可诊断性继续保留。
- 不自动发布、推送或删除旧仓库。合并后的完整功能验收通过，才处理旧 checkout 的归档。

## 实施记录

| 批次 | 实现结果 |
| --- | --- |
| 1 | Unit 统一 `.size()`；Point 统一 `.pointSize()`。删除旧 Bar segment、attention 别名、字符串数据绑定、复数 semantic-key 角色及旧 URL 生成。Unit 复合 key 复用 Core 身份规则 |
| 2 | 41 页公共 MDX 为单一源；构建生成 npm Markdown、类型片段和哈希。内部工程记录迁入 `docs/internal/`；LLM 输出、MCP 搜索均读取同源内容 |
| 3 | `examples/story/network/` 和 `weather/` 为普通网站。天气原始档案、来源和离线 tidy 数据保留；只准备请求过的状态或过渡，保留 resize、逆向 seek、异步竞态和离页清理 |
| 4 | `integrations/mcp/` 仅包装原生 `{method,args}`。Studio 保留 revision、批次原子性、实际浏览器回执、工作区归属、取消和关闭清理；收敛为一条文本/转写/验证后语音路径 |
| 5 | 一个 root lockfile/workspace、导航和本地启动入口。Gallery 静态显示并将同一声明交给 Playground；Story 就地预览并提供源码；Liveshow 在本地挂接 MCP/可选 AI 服务 |

旧 Story/Liveshow checkout 未改动、未删除，也不再作为整合版的构建依赖。
没有复制凭据、保留 vendor 同步机制或引入旧接口兼容层；没有提交、推送或发布。

最终验收全部通过：

- 主库 399 项、Studio 服务端 45 项；React 2 项及渲染/编辑/轴/分布 4 项浏览器套件。
- `/visdelta` 生产子路径全站 86 项；最终差异另经干净安装 9 项及实际本地预览 14 项验证。
- 全新 workspace 的 npm ci、主库/Studio 构建、真实 tarball 安装与类型消费；另验证 Node 18.20.8 消费。
- 浏览器 ESM/独立 lazy bundles/global 分发，agent HTML、安装包 Story 和自定义插件生命周期。
- 单命令开发启动、四入口、MCP 代理实际编辑、关闭释放端口；生产预览四入口、源码下载和构建指纹匹配。
- lint、严格类型、23 个 live examples、25 个 Playground stories；公开示例不再包含 fold 数据整理。

语音使用 Chromium 测试音源、真实 AudioWorklet 和模拟模型响应验证；本次未调用真实模型或验收实际麦克风。
本地整合预览运行于 `http://127.0.0.1:4347/`。发布、提交和旧 checkout 归档不属于本次执行。

2026-11-05 交付：按用户要求提交整合成果并推送 `main`；旧 checkout 已原样移至
`/Users/songhaifan/Developer/frankfsh/visdelta-story` 和 `visdelta-liveshow`，迁移前后 HEAD 与工作区状态一致。
