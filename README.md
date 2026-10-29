# DeepSeek Harness Cost Meter

[English](README.en.md) · 简体中文

[![CI](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml)

独立社区插件，采用 MIT 许可证；与 DeepSeek 官方无隶属关系。

在每轮回复下方显示 **本轮模型费用约 CNY 0.012300 · 1 次调用**。点击展开模型、token、单价、峰谷时段及累计费用。支持正常完成、错误和中断轮次。

兼容性：已在 macOS 桌面版 **DeepSeek Harness 0.2.1-rc.3** 验证。使用 `sessionProjections`、`storageDomain`、`conversation.chat.turnTail` 和 `useProjection`；其他版本需要重新验证。

## 安装

需要已安装的 DeepSeek Harness。源码安装和开发需要 Node.js 22 或更新版本、npm 和 Git；已验证的 Harness 版本见上文。

```sh
git clone https://github.com/luomuwen/deepseek-cost-meter.git
cd deepseek-cost-meter
npm ci --ignore-scripts
bash scripts/install-local.sh
```

安装脚本优先使用 macOS 桌面版自带 CLI；其他环境使用 PATH 中的 `dsh`，默认安装到 `web` profile。可以用 `bash scripts/install-local.sh desktop` 指定 profile。这是本地链接安装，请保留源码目录。若界面未立即更新，退出并重新打开 Harness。

手动安装：

```sh
dsh plugin --profile desktop add "$PWD"
# Web profile:
dsh plugin --profile web add "$PWD"
```

macOS 桌面版若没有全局 `dsh`，使用 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh` 替代命令。插件不需要 API Key，不会发起额外模型请求。

也可以从 [Releases](https://github.com/luomuwen/deepseek-cost-meter/releases) 下载 `.tgz` 安装包：

```sh
dsh plugin --profile desktop add /absolute/path/local-deepseek-cost-meter-0.1.0.tgz
```

运行 `npm pack` 可自行打包。运行依赖 zod 随包分发；React 由 Harness 提供。npm 包名保留为 `@local/deepseek-cost-meter` 以兼容现有安装；本项目不发布到 npm registry。

## 计费口径

- 一轮为 `turn/start` 到 `turn/end`，包括本会话内各步骤和已记录的重试尝试。
- 读取 API 返回的持久化 usage，不使用字符数估算 token。不把多个累计 usage 样本相加。
- 输入、缓存读取、缓存写入、输出是互斥桶；推理 token 已包含在输出中，不重复收费。
- 默认缓存写入按未缓存输入价计算；若服务商采用其他规则，请显式配置。
- 缺少 usage、模型价格或缓存拆分时显示不完整；已知金额为部分合计，不代表最终账单。
- 不含子 Agent 独立会话、标题生成、Search/Fetch、其他工具费用及账户优惠。
- 金额用 BigInt 定点计算，持久状态用十进制字符串，显示六位小数。
- 分叉继承记录可显示，累计新增费用不重复包含继承历史。
- 每轮展示的累计值固定为截至该轮结束时的值。多币种分别显示，不自动换汇。

## 默认价格

核验日期：2026-10-29；来源：[DeepSeek 官方人民币定价](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。币种 CNY，单位元 / 百万 token。

| 模型 | 时段 | 未缓存输入 | 缓存命中 | 输出 |
|---|---|---:|---:|---:|
| deepseek-flash | 空闲 | 1 | 0.02 | 4 |
| deepseek-flash | 高峰 | 2 | 0.04 | 8 |
| deepseek-v4-pro | 空闲 | 4.5 | 0.15 | 13.5 |
| deepseek-v4-pro | 高峰 | 9 | 0.30 | 27 |

峰值窗口为北京时间周一至周五 09:00–12:00、14:00–18:00，周末和配置中的节假日除外。按 `step/start` / `llm/retry-started` 时间近似请求开始时间；跨边界请求仍属于估算。

内置表只回算 **2026-10-29 00:00（北京时间）及以后**的记录。该日期前不猜测历史价。内置节假日日历覆盖到 2026-12-31，此覆盖区间内无中国法定节假日；进入 2027 年后会提示更新日历，避免套用未经核验的时段规则。

`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 按官方别名规则使用 Flash 价格。支持 Harness 官方路由 `deepseek-official`、登录账号路由 `deepseek-account`，以及 `deepseek`；前两者没有显式价格行时使用 `deepseek` 价格。账号路由也仅按公开 API 价格估算，不读取账户实际扣款。其他 provider 不自动套用官方价格，即使模型名称相同。

## 修改价格

首次安装可修改 `rates.json`。运行后修改该文件并重启，或通过个人配置中对应插件行的 `config.rates` 指定完整同结构价格表。示意：

```yaml
- id: local-deepseek-cost-meter
  config:
    rates:
      version: my-provider-2026-11-01
      source: manual
      effectiveFrom: '2026-11-01T00:00:00+08:00'
      calendarThrough: '2027-12-31'
      holidays: []
      prices:
        - provider: my-provider
          models: [my-model]
          currency: CNY
          offPeak:
            input: '1'
            cacheRead: '0.02'
            cacheWrite: '1'
            output: '4'
```

不提供 `peak` 则全天使用 `offPeak`。价格以字符串填写，最多六位小数。配置是完整替换，需保留仍要使用的其他模型行；高峰日历需提供实际节假日，不应随意延长覆盖期。

每次价格配置变化会向 Harness 存储域 `local_turn_cost_prices` 追加不可变快照。首次快照从 `effectiveFrom` 回算；后续快照从加载新配置的时间生效。已保存的旧快照继续用于旧调用；卸载不会删除快照。更新算法或价格目录时投影缓存自动重建。丢失该存储域后只能按剩余价格表回算，因此此插件不是财务账本。

## 开发与验证

```sh
npm ci
npm run build
npm run check
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' \
  --expose-internals scripts/runtime-smoke.cjs
```

- `src/pricing.js`：价格校验、峰谷规则、定点计算。
- `src/projection.js`：增量处理调用尝试、轮次汇总和分叉边界。
- `index.js`：价格快照与 Host 投影注册。
- `src/client-factory.js`：原生插槽组件；`client.js` 是生成产物。
- `locale/`：中英文文案；`icon.svg`：原创图标。

统计状态只保存每轮聚合明细，不复制提示词、回答、工具结果或 API Key。空间随轮数和不同模型/价格组合数增长。客户端通过投影读取结果，不扫描聊天 DOM，不修改对话内容。插件不增加模型 token，也不改变 KV Cache。

## 卸载

可在 Harness 插件页关闭或移除“每轮费用”。也可运行：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop remove @local/deepseek-cost-meter
```

若当前进程未自动卸载，请重启应用。会话日志不会被插件改写。

## 参与贡献与许可

欢迎提交 Issue 和 Pull Request。请先阅读 [贡献指南](CONTRIBUTING.md)、[安全政策](SECURITY.md) 和 [更新记录](CHANGELOG.md)。详细架构见 [架构说明](docs/architecture.md)，手动集成验证记录见 [VERIFICATION.md](VERIFICATION.md)。

采用 [MIT License](LICENSE)。DeepSeek Harness 是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 项目；相关名称与商标归各自所有者所有。
