# 本地验证记录

## 0.2.0 多渠道验证（2026-11-01）

- 环境：macOS、DeepSeek Harness Desktop 0.2.1-rc.5；29 项单元与包元数据测试通过。
- 覆盖 Kimi 国内价格、海外与代理渠道隔离、MiniMax Flash、套餐与按量混用、K3 未知缓存写入价格、部分/冲突 usage、自定义价格覆盖和生效日期。
- 使用真实 Harness Cordis、Session、Projection 和 JSON Storage 服务，注入合成会话事件，验证已有价格目录升级、混合渠道聚合、历史费用保持、React 渲染及卸载/重载重放。
- 对实际 `.tgz` 安装包解包后重复上述集成检查；检查包内运行文件、内置 Zod 与用户文档，排除研究草稿和重复 React。
- 未向 Kimi、千问、MiniMax 或智谱发起真实收费请求；这些渠道的网络兼容性和最终账户扣款未经端到端验证。计量依赖 dsh 已保存的统一 usage。

## 0.1.1 npm 发布验证（2026-11-01）

- 17 项单元与包元数据测试通过；检查 npm 包名、Cordis 引用和生成客户端注册 ID 一致。
- 将实际 `.tgz` 解包到隔离目录，以 `DSH_COST_PLUGIN_ROOT` 指向该目录运行真实 Harness 集成检查，验证 Host 加载、生成客户端渲染、价格存储及卸载/重载。
- 保留原有投影、配置行和存储域标识，未改计费算法。

## 0.1.0 首次验证

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
