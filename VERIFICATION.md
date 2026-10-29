# 本地验证记录

日期：2026-10-29；环境：macOS、DeepSeek Harness Desktop 0.2.1-rc.3。

- `npm run check`：15 项计费测试全部通过，Host 和生成的 Client JavaScript 语法检查通过。
- `scripts/runtime-smoke.cjs`：使用已安装 Harness 的真实 Cordis、Session、Projection、JSON Storage 服务验证注册、事件驱动、价格持久化、卸载和重新加载；使用 React 18.2 验证组件渲染与清理。
- 隔离 profile：通过官方 `dsh plugin --profile web add` 安装，使用临时 `DSH_HOME` 启动真实 Web composition，插件成功激活。
- 实际 Desktop profile：通过应用附带官方 CLI 安装。插件页出现“每轮费用”，启用状态为 on。重启后，现有历史对话成功显示每轮费用、调用次数、缓存及输出明细和累计金额。
- 官方账号路由 `deepseek-account` 在真实界面验证通过；普通 API 路由 `deepseek-official` 有自动化覆盖。
- `npm pack`：生成包含全部运行文件、原创 SVG 图标、中英文文案以及 zod 4.6.7 的安装包。
- 依赖安装审计：0 个已知漏洞。没有发起额外收费模型请求，没有改写用户会话日志。

限制：没有向真实 API 新发请求测试流式网络过程；该部分由持久化事件测试覆盖。未验证其他 Harness 版本、Windows/Linux、2027 年峰谷日历及第三方提供商账单。

首次热安装时，已经连接的旧会话可能暂时显示“费用统计正在加载”；重启 Harness 后恢复正常。修改插件代码后也需重启以加载新模块。
