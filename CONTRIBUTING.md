# 内容维护指南

## 新增文章

1. 从 `templates/knowledge-note.md` 复制一份文件到对应专题目录。
2. 文件名使用小写英文和连字符，例如 `event-loop.md`。
3. 在对应专题的 `README.md` 中把题目改成文章链接。
4. 在 `.vitepress/config.mts` 对应侧边栏分组中增加链接。
5. 本地运行 `npm run docs:dev` 检查阅读效果。

## 内容与网站的关系

Markdown 是唯一内容源。GitHub 直接展示 Markdown，网站构建时也读取同一批文件，因此不需要复制内容。

## 推荐提交粒度

一篇知识点使用一次独立提交，例如：

```text
docs(js): add event loop interview notes
docs(rag): add hybrid search notes
```

站点配置和内容提交尽量分开，方便以后回顾和回滚。
