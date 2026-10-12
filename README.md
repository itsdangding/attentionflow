<div align="center">

# AttentionFlow

**回顾你在 Linux DO 的浏览、停留与阅读，让注意力有迹可循。**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Version](https://img.shields.io/badge/Version-0.1.2%20Alpha-709266?style=for-the-badge)](./CHANGELOG.md)
[![LINUX DO](https://img.shields.io/badge/LINUX%20DO-社区交流-E9711C?style=for-the-badge&logo=linux&logoColor=white)](https://linux.do)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

[快速安装](#安装) · [功能介绍](#功能) · [LINUX DO 社区](https://linux.do) · [贡献指南](./CONTRIBUTING.md) · [开源协议](./LICENSE)

</div>

---

AttentionFlow 是一款面向 [LINUX DO 社区](https://linux.do) 的开源 Chrome 扩展。它记录哪些帖子进入过视野，哪些让你停留，哪些被点击，以及你实际花了多久阅读，并在统计面板中呈现你的注意力流。

所有浏览记录保存在当前浏览器中，无需注册账号。当前版本为 **v0.1.2 Alpha**。

## 功能

- **浏览概览**：查看今天和最近七天的有效浏览时间、帖子数量与变化趋势。
- **注意力漏斗**：从经过、看见、停留到点击、阅读和深度阅读，按帖子去重统计。
- **阅读排行**：查看阅读时间最长的帖子、访问次数和楼层深度。
- **阅读历史**：按日期回看读过的帖子，支持标题搜索与标签筛选，点击回到上次读到的楼层。
- **浏览会话**：回顾每次浏览的时间段，切换标签页或离开浏览器时暂停计时。
- **数据管理**：支持 JSON 导入、导出和删除，随时开启或关闭采集。

支持 Linux DO 的帖子列表、分类、标签、搜索结果和帖子页推荐列表。

## 安装

### 使用已构建的扩展

1. 在 [Releases](https://github.com/wanxiao2018/attentionflow/releases/latest) 的 Assets 中下载 `attentionflow-0.1.2-chrome.zip`（不要下载 Source code，那是未构建的源码，无法直接安装）。解压后将文件夹放在固定位置；其中应直接包含 `manifest.json`。直接把 zip 拖进扩展页面不能安装。
2. Chrome 地址栏打开 `chrome://extensions`，开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后的文件夹。
4. 刷新已打开的 Linux DO 页面，开始正常浏览。
5. 点击工具栏中的 AttentionFlow 图标，打开统计面板。

使用构建后的扩展不需要安装 Node.js，也不需要启动服务器。安装后请保留加载的文件夹。

### 从源码构建

需要 Node.js 22.12+ 和 npm。

```sh
git clone https://github.com/wanxiao2018/attentionflow.git
cd attentionflow
npm ci
npm run build
```

在 Chrome 的扩展管理页加载 `.output/chrome-mv3`。运行 `npm run zip` 可生成分发 ZIP，输出位于 `.output/`。

## 使用与统计规则

打开论坛正常浏览即可自动记录。Dashboard 提供 **Today**、**Last 7 Days** 和 **Settings** 三个页面。

| 阶段 | 含义 |
| --- | --- |
| Passed | 帖子进入过可视区域 |
| Seen | 帖子在屏幕中央注意区内停留，并达到可见比例和滚动速度条件 |
| Noticed | 在 Seen 的基础上，出现足够的分摊注意时间、停留、减速或悬停 |
| Clicked | 从列表中点击帖子 |
| Read | 在帖子详情页有效阅读至少 10 秒 |
| Deep Read | 有效阅读至少 3 分钟，或至少 90 秒且楼层深度达到 70% |

只有论坛标签页可见且获得焦点、浏览器窗口处于前台时计时。连续 90 秒没有鼠标、键盘或滚动活动会暂停。阅读记录和面板通常每 15 秒更新一次，也可以手动刷新面板。

数量按帖子去重。通知、外部链接和直接访问产生的阅读单独计入「漏斗外阅读」。这些分类是基于浏览行为的估计，不代表眼动测量或对阅读理解的判断。

### 数据没有更新

确认 Settings 中 Tracking 已开启、扩展允许访问 `https://linux.do/*`，然后刷新论坛页面。在帖子列表停留并滚动，从列表打开一个帖子，在前台阅读 20 秒后刷新统计面板。

如仍没有数据，可以开启 Debug Mode，观察列表页右下角的 Topic 与 attention 数值。调试结束后建议关闭 Debug Mode，避免持续积累调试记录。

### 升级与备份

升级前在 Settings 导出 JSON 备份。将新版本解压到原加载目录，在扩展管理页点击「重新加载」，再刷新论坛页面。卸载扩展会清除本地记录。

## 隐私

扩展不上传浏览记录，不接入广告或分析服务。浏览记录、帖子标题、分类、标签和调试记录保存在本地扩展存储中。

为了计算楼层深度，扩展会向当前 Linux DO 站点请求对应帖子 JSON，仅保存总楼层数，不持久化响应正文。用户主页、通知页面和识别到的私信页面不参与采集。

导出的 JSON 可能包含个人浏览历史，请妥善保管，不要提交到公开仓库。

## 开发与贡献

项目使用 TypeScript、React、WXT 和 Dexie。欢迎提交问题、改进建议和 Pull Request。

```sh
npm run dev
npm run typecheck
npm test
npm run build
```

贡献步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)，浏览器测试清单见 [docs/alpha-validation.md](docs/alpha-validation.md)。当前版本处于 Alpha 阶段，完整浏览器兼容性验证和注意力阈值校准仍在进行。

## 社区与反馈

欢迎在 [LINUX DO 社区](https://linux.do) 交流使用体验，或在 [GitHub Issues](https://github.com/wanxiao2018/attentionflow/issues) 报告问题、提出建议。提交问题时请附上 Chrome 版本、扩展版本和复现步骤，并注意保护个人浏览历史。

## 许可证

[MIT](LICENSE)。本项目与 Linux DO 无官方关联。
