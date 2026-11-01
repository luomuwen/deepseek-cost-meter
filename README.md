# DeepSeek Harness Cost Meter

[English](README.en.md) · 简体中文

[![CI](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/luomuwen/deepseek-cost-meter/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/deepseek-cost-meter)](https://www.npmjs.com/package/deepseek-cost-meter)
[![npm downloads](https://img.shields.io/npm/dm/deepseek-cost-meter)](https://www.npmjs.com/package/deepseek-cost-meter)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[npm 安装包](https://www.npmjs.com/package/deepseek-cost-meter) · [dsh market](https://awesome-dsh-plugin.com/zh/p/luomuwen/deepseek-cost-meter/) · [版本发布](https://github.com/luomuwen/deepseek-cost-meter/releases) · [问题反馈](https://github.com/luomuwen/deepseek-cost-meter/issues)

独立社区插件，采用 MIT 许可证；与 DeepSeek 官方无隶属关系。

在每轮回复下方显示 **本轮模型费用约 CNY 0.012300 · 1 次调用**。点击展开模型、token、单价、峰谷时段及累计费用。支持正常完成、错误和中断轮次。

兼容性：已在 macOS 桌面版 **DeepSeek Harness 0.2.1-rc.3** 验证。使用 `sessionProjections`、`storageDomain`、`conversation.chat.turnTail` 和 `useProjection`；其他版本需要重新验证。

## 安装

需要已安装的 DeepSeek Harness；已验证版本见上文。插件不需要 API Key，不会发起额外模型请求。

推荐通过 npm 包名安装到桌面版：

```sh
dsh plugin --profile desktop add deepseek-cost-meter
```

macOS 若提示 `dsh: command not found`，可直接复制下面的完整命令：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add deepseek-cost-meter
```

Web 版使用 `dsh plugin --profile web add deepseek-cost-meter`。安装后重启对应的 Harness 应用或 Web 服务，完成一轮对话后即可在回复下方查看费用。

市场展示名为 **DeepSeek Cost Meter（每轮费用）**，npm 包名为 **`deepseek-cost-meter`**。市场的 npm 信息由其定时任务自动同步；若市场仍展示旧版安装包，可直接使用上面的 npm 命令。

### 更新 npm 版

```sh
dsh plugin --profile desktop add deepseek-cost-meter@latest
```

更新后重启 Harness。Web 用户改用 `--profile web`；查看本机安装版本可运行 `dsh plugin --profile desktop list --depth 0`。

### 从 0.1.0 升级

旧包名是 `@local/deepseek-cost-meter`。请先保存自行配置的 `config.rates`，移除旧包再安装新包，不要同时启用两者：

```sh
dsh plugin --profile desktop remove @local/deepseek-cost-meter
dsh plugin --profile desktop add deepseek-cost-meter
```

安装后重新应用自定义价格并重启 Harness。存储域和投影标识保持不变，可继续使用原有价格快照。

### 源码或安装包

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
dsh plugin --profile desktop add /absolute/path/deepseek-cost-meter-0.1.1.tgz
```

运行 `npm pack` 可自行打包。运行依赖 zod 随包分发；React 由 Harness 提供。npm 包名为 `deepseek-cost-meter`，公开发布到 npm registry；市场展示名保持“DeepSeek Cost Meter（每轮费用）”。

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

推荐通过个人配置中对应插件行的 `config.rates` 指定完整同结构价格表，避免直接修改已安装包的文件后被升级覆盖。源码开发时也可修改 `rates.json`。修改后重启 Harness。示意：

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

## 下载统计

- [npm 包页面](https://www.npmjs.com/package/deepseek-cost-meter)可查看版本和下载量；顶部徽章展示最近一个月的 npm 下载量。
- [最近一周下载量 JSON](https://api.npmjs.org/downloads/point/last-week/deepseek-cost-meter)和[最近一个月下载量 JSON](https://api.npmjs.org/downloads/point/last-month/deepseek-cost-meter)可用于自己的统计工具。
- [GitHub Releases](https://github.com/luomuwen/deepseek-cost-meter/releases)安装包下载与 npm 下载分别统计。npm 下载次数不等于独立用户数或活跃安装数，CI、重复安装和缓存都会影响统计。

插件本身不上传使用遥测。新发布包的下载统计和市场展示可能延迟更新。

## 常见问题

- **安装后没有费用栏：** 确认安装到了正在使用的 `desktop` 或 `web` profile，重启 Harness 后完成一轮对话，并确认未同时启用旧版 `@local/deepseek-cost-meter`。
- **显示“不完整”或没有金额：** 检查该轮是否有 usage、provider/model 是否有对应价格，以及记录时间是否在价格和日历覆盖范围内。缺失数据不会按零费用处理。
- **与账户扣费不同：** 本插件按已记录 usage 和配置价格估算模型费用，不读取账户账单；优惠、其他工具费用及独立子会话等不在该金额中。

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
  plugin --profile desktop remove deepseek-cost-meter
```

若当前进程未自动卸载，请重启应用。会话日志不会被插件改写。

## 参与贡献与许可

欢迎提交 Issue 和 Pull Request。请先阅读 [贡献指南](CONTRIBUTING.md)、[安全政策](SECURITY.md) 和 [更新记录](CHANGELOG.md)。详细架构见 [架构说明](docs/architecture.md)，手动集成验证记录见 [VERIFICATION.md](VERIFICATION.md)。

采用 [MIT License](LICENSE)。DeepSeek Harness 是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 项目；相关名称与商标归各自所有者所有。
