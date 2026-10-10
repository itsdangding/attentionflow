# Changelog

## 0.1.1 - 2026-10-10

### 修复

- 同一毫秒内重复采样时保持曝光加权平均值有效，避免无效数字阻止整批记录写入。
- 同一 Topic 的楼层、查询参数与锚点 URL 更新不再拆分连续阅读或增加访问次数；真正切换 Topic 时仍创建新访问。
- 正确解析无标题路径 `/t/43/70` 中的 Topic ID，避免把楼层号当作帖子编号。
- 私信页暂停采集，用户主页、通知和私信等排除页面不再生成 Debug Trace 或调试面板。
- 异步消息使用 `sendResponse` 与 `return true`，兼容尚未支持 Promise 消息监听器的 Chrome；后台错误仍能传回调用方。
- Dashboard 版本号跟随集中配置。

### 开源准备

- 添加 MIT 许可证、贡献指南、打包依赖许可声明与 GitHub Actions CI。
- 补充直接安装、升级备份、数据为零时的诊断步骤和隐私说明。
- 类型检查与 48 项自动化测试通过；保留 Alpha 状态，完整真实浏览器验收尚未完成。

## 0.1.0 - 2026-10-10

### 初始实现

- Linux DO 列表曝光、注意力分摊、点击候选集、有效阅读、楼层深度与全局 Session。
- Today、Last 7 Days、Attention Funnel、阅读排行、Session Timeline、设置与 Debug Trace。
- 本地 IndexedDB 持久化、JSON 导入导出与删除记录。
