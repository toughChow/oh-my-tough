import { defineConfig } from 'vitepress'

const base = process.env.BASE_PATH || '/'

export default defineConfig({
  lang: 'zh-CN',
  title: 'AI 全栈面试知识库',
  description: '面向 AI 应用型全栈工程师的持续学习与面试知识库',
  base,
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  head: [
    ['meta', { name: 'theme-color', content: '#5b5bd6' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }]
  ],
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    logo: undefined,
    siteTitle: 'Oh My Tough',
    nav: [
      { text: '首页', link: '/' },
      { text: '学习路线', link: '/00-roadmap/12-week-plan' },
      { text: '知识地图', link: '/README' },
      { text: '进度', link: '/00-roadmap/progress' }
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索知识库' },
          modal: {
            noResultsText: '没有找到相关内容',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },
    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    sidebarMenuLabel: '知识目录',
    returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    lastUpdated: { text: '最后更新于' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '知识地图', link: '/README' },
          { text: '12 周学习路线', link: '/00-roadmap/12-week-plan' },
          { text: '学习进度表', link: '/00-roadmap/progress' }
        ]
      },
      {
        text: '全栈工程',
        collapsed: false,
        items: [
          {
            text: 'JavaScript 与 TypeScript',
            link: '/01-javascript-typescript/',
            items: [
              { text: '执行上下文', link: '/01-javascript-typescript/execution-context' }
            ]
          },
          { text: '前端框架', link: '/02-frontend/' },
          {
            text: '浏览器与网络',
            link: '/03-browser-network/README',
            items: [
              { text: '虚拟网络学习路线', link: '/03-browser-network/virtual-network/README' },
              { text: 'OrbStack 实验环境', link: '/03-browser-network/virtual-network/orbstack-setup' },
              { text: '实验 1：namespace、veth 与 bridge', link: '/03-browser-network/virtual-network/lab-01-bridge' },
              { text: '实验 2：跨子网路由', link: '/03-browser-network/virtual-network/lab-02-router' }
            ]
          },
          { text: '后端与 API', link: '/04-backend-api/' },
          { text: '数据库', link: '/05-database/' },
          { text: 'Redis 与消息队列', link: '/06-redis-message-queue/' },
          { text: '操作系统与 Linux', link: '/07-os-linux/' },
          { text: '数据结构与算法', link: '/08-algorithms/' }
        ]
      },
      {
        text: 'AI 应用工程',
        collapsed: false,
        items: [
          { text: 'LLM 基础', link: '/09-llm-foundations/' },
          { text: 'RAG', link: '/10-rag/' },
          { text: 'Agent', link: '/11-agent/' },
          { text: 'AI 工程化', link: '/12-ai-engineering/' }
        ]
      },
      {
        text: '面试实战',
        items: [
          { text: '系统设计', link: '/13-system-design/' },
          { text: '项目与面试表达', link: '/14-project-interview/' },
          { text: '错题与复习', link: '/15-review/' }
        ]
      }
    ],
    socialLinks: []
  }
})
