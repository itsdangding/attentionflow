# 贡献指南

使用 Node.js 22.12+ 和 npm，依赖版本由 `package-lock.json` 固定。

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` 启动 WXT 开发模式。构建后在 Chrome 开发者模式加载 `.output/chrome-mv3`；更新扩展后刷新 Linux DO 页面。

请保留站点解析、纯计算模型和后台持久化之间的边界。修复采集或统计错误时，先加入能复现触发条件的回归测试，再修改实现。真实浏览器验收按 [验收清单](docs/alpha-validation.md) 执行；仅在实际完成对应场景后更新结果。

提交问题时说明版本、Chrome 版本、页面类型、复现步骤和预期结果。分享调试信息前去除帖子标题、用户名及个人浏览历史；不要提交原始数据导出、访问凭据、浏览器配置或 `.env` 文件。
