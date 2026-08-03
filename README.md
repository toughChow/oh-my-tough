# AI 全栈面试知识库

这是一套面向 **AI 应用型全栈工程师** 的面试知识库。目标不是收集尽可能多的资料，而是让每个知识点都达到：能简答、能追问、能落地、能联系项目。

本仓库同时是一套响应式文档网站：Markdown 是唯一内容源，可以直接在 GitHub 阅读，也可以构建为适配电脑和移动端的网站。站点维护方式见 [内容维护指南](CONTRIBUTING.md)。

## 学习原则

每个知识点按以下顺序掌握：

1. 一句话说清楚“是什么”。
2. 解释“为什么需要”和底层原理。
3. 回答至少三层常见追问。
4. 说明项目中的使用方式、风险和替代方案。
5. 闭卷复述，并按 1、3、7、14 天复习。

## 学习路线

| 阶段 | 建议周期 | 核心目标 |
| --- | --- | --- |
| 全栈主链路 | 第 1～4 周 | 做出带鉴权、数据库、缓存和部署的完整应用 |
| AI 应用开发 | 第 5～9 周 | 掌握 LLM、RAG、Agent、评测和安全 |
| 系统设计与面试 | 第 10～12 周 | 能设计系统、讲好项目并完成模拟面试 |

详细安排见 [12 周学习路线](00-roadmap/12-week-plan.md)。

## 知识库目录

- [00｜路线与进度](00-roadmap/README.md)
- [01｜JavaScript 与 TypeScript](01-javascript-typescript/README.md)
- [02｜前端框架](02-frontend/README.md)
- [03｜浏览器与网络](03-browser-network/README.md)
- [04｜后端与 API](04-backend-api/README.md)
- [05｜数据库](05-database/README.md)
- [06｜Redis 与消息队列](06-redis-message-queue/README.md)
- [07｜操作系统与 Linux](07-os-linux/README.md)
- [08｜数据结构与算法](08-algorithms/README.md)
- [09｜LLM 基础](09-llm-foundations/README.md)
- [10｜RAG](10-rag/README.md)
- [11｜Agent](11-agent/README.md)
- [12｜AI 工程化](12-ai-engineering/README.md)
- [13｜系统设计](13-system-design/README.md)
- [14｜项目与面试表达](14-project-interview/README.md)
- [15｜错题与复习](15-review/README.md)

## 推荐主技术栈

- 前端：TypeScript、React、Next.js
- 后端：Python、FastAPI
- 数据：PostgreSQL/MySQL、Redis
- AI：LLM API、Embedding、RAG、Tool Calling
- 工程：Linux、Docker、GitHub Actions

技术栈可以替换，但在一轮求职准备中尽量只保留一条主线。

## 文档标准

新增知识点时复制 [知识点模板](templates/knowledge-note.md)。项目复盘使用 [项目模板](templates/project-story.md)。文件名统一使用小写英文和连字符，例如 `event-loop.md`。

## 完成标准

- **了解**：看过资料，能识别概念。
- **掌握**：能在 2 分钟内闭卷回答，并承受三层追问。
- **精通**：能结合项目说明取舍、故障和优化指标。

求职阶段优先让高频知识达到“掌握”，再把项目强相关内容提升到“精通”。
