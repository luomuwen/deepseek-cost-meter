# 多渠道用量与费用 / Provider support

适用于 0.2.0；核验日期：2026-11-01。插件使用 dsh 已保存的统一 TokenUsage，不负责配置 API Key、注册模型或改变模型请求。接入模型仍在 Harness 中完成。下面的 provider ID 是 dsh 渠道标识，不是模型厂商名称的任意缩写。

## 开箱即用的范围

| 渠道 ID | 处理方式 |
|---|---|
| `deepseek`、`deepseek-official`、`deepseek-account` | 保留 DeepSeek 官方峰谷价估算，详见 README |
| `moonshotai-cn` | 以下 6 个 Kimi 模型的人民币价格 |
| `minimax-cn` | 以下 MiniMax-M3.1-Flash 人民币价格 |
| `kimi-coding` | 套餐用量 |
| `qwen-token-plan`、`qwen-token-plan-cn`、`qwen-token-plan-individual` | 套餐用量 |
| `zai`、`zai-coding-cn` | 当前 dsh 的这些内置路由指向 Coding Plan，显示套餐用量 |
| `openai-codex`、`github-copilot` | 套餐用量，不换算逐次扣费 |
| `xiaomi-token-plan-ams`、`xiaomi-token-plan-cn`、`xiaomi-token-plan-sgp` | 套餐用量 |
| 其他渠道 / 模型 | 显示已记录的 token；无匹配价格时明确显示金额不可估算 |

渠道分类仅针对上述内置路由。自定义接口可以使用 `providerModes` 覆盖分类。套餐标签不表示读取了套餐余额或超额扣款；插件没有账户账单权限。

下列单价均为 **CNY / 百万 token**。新增行从核验时间 **2026-11-01T05:43:39Z** 起适用；旧安装还受本地新快照的加载时间限制。

| Provider | 精确模型 ID | 未缓存输入 | 缓存读取 | 输出 |
|---|---|---:|---:|---:|
| `moonshotai-cn` | `kimi-k2.6` | 6.50 | 1.10 | 27.00 |
| `moonshotai-cn` | `kimi-k2.7-code` | 6.50 | 1.30 | 27.00 |
| `moonshotai-cn` | `kimi-k2.7-code-highspeed` | 13.00 | 2.60 | 54.00 |
| `moonshotai-cn` | `kimi-k3` | 20.00 | 2.00 | 100.00 |
| `moonshotai-cn` | `kimi-k3.1-pro` | 13.00 | 1.30 | 68.00 |
| `moonshotai-cn` | `kimi-k3.1-pro-highspeed` | 26.00 | 1.30 | 136.00 |
| `minimax-cn` | `MiniMax-M3.1-Flash` | 1.00 | 0.10 | 4.00 |

来源：[Kimi 官方价格](https://platform.kimi.com/docs/pricing/chat)、[Kimi 缓存机制](https://platform.kimi.com/docs/guide/context-caching)、[MiniMax 官方价格](https://platform.minimax.cn/docs/pricing/overview)。模型可用性由 dsh 与服务商决定；有内置价格不代表该模型已经出现在本机模型列表中。Kimi K2 系列属于过渡期模型，请留意官方迁移安排。

这些新增行的缓存写入单价保留为 `null`。Kimi K3 的缓存写入按 5 分钟 / 1 小时 TTL 分档，而 dsh 当前统一 usage 仅保留总量。发生写入时，插件显示已知输入、缓存读取和输出费用，并注明缺少缓存写入价格；不把输入价误作写入价。写入量明确为零时，不影响完整估算。

没有将国内人民币价套到 `moonshotai`、`minimax` 海外渠道或转售平台。MiniMax M3 等分档定价模型尚未内置价格；它们仍可显示用量。未使用 SDK 中的默认零成本作为免费证据。

## 为千问按量接口或其他渠道补充价格

先在 Harness 中配置可用模型，完成一次调用，在费用明细中查看实际 `provider / model`。把该标识原样填入个人配置中现有插件行的 `config`。不要新建第二个相同插件实例。

下面是用户自建百炼北京接口、`qwen3.8-27b` 的配置示例。`my-qwen-beijing` 是占位 ID，必须替换；它不是 dsh 内置 provider。示例采用核验时的普通按量价与隐式缓存读取价，不能用于其他地区、套餐、批量或其他计费档位。配置前请核对自己的接口与计费方式。

```yaml
- id: local-deepseek-cost-meter
  config:
    additionalRates:
      - provider: my-qwen-beijing
        models: [qwen3.8-27b]
        currency: CNY
        source: 'https://help.aliyun.com/zh/model-studio/model-pricing'
        effectiveFrom: '2026-11-01T05:43:39Z'
        offPeak:
          input: '3'
          cacheRead: '0.6'
          cacheWrite: null
          output: '12'
```

来源：[百炼模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)、[上下文缓存](https://help.aliyun.com/zh/model-studio/context-cache)。隐式缓存命中按输入价格的 20% 计费；显式缓存可能含额外存储费用，本插件不计算存储时长收费。

`additionalRates` 仅覆盖精确匹配的 provider/model，不影响其他内置价格。价格必须是字符串，未知填 `null`，明确免费才填 `'0'`。每条必须填写 `effectiveFrom`；未填写 `source` 时标注为用户配置。所有自定义价格均由使用者维护，插件不会自动抓取价格。

## 指定渠道的计费方式

```yaml
- id: local-deepseek-cost-meter
  config:
    providerModes:
      my-local-model: usage-only
      my-coding-plan: subscription
      my-paygo-api: metered
```

- `metered`：按匹配价格估算金额；未知价格不会被当成零。
- `subscription`：显示套餐用量，不估算逐次扣费。
- `usage-only`：只显示 token，不估算金额，适用于本地部署或不希望估价的渠道。

默认套餐路由即使添加了单价也不会计费；只有明确使用按量接口时，才同时覆盖为 `metered`。旧版 `config.rates` 仍可完整替换价格目录，但也会替换内置套餐分类，需自行保留所需规则。

## 历史与精度

从 0.1.x 升级不重写历史账目。旧记录保留原有快照，新规则从新版加载时开始生效。单价行的 `effectiveFrom` 还会阻止用新价猜测更早的历史记录。

模型 API 必须返回 usage，且 dsh 必须将其保存为会话事件。只返回部分计数时可以展示已记录数值，但不计算金额；缺失项显示“未知”。计数不一致时同样不计费。输入、缓存读取、缓存写入和输出按 dsh 的互斥计数计算；reasoning 已包含在输出中。token 合计是已保存计数，不是对账户扣款的核对。

## English summary

Version 0.2.0 reads normalized usage from existing Harness sessions. It includes the CNY tariffs listed above, treats the listed plan routes as subscriptions, and displays recorded counters for other routes. Provider/model matching is exact; international and reseller routes never inherit China prices. Unknown cache-write prices produce explicitly partial subtotals. Missing or inconsistent usage is displayed but not billed.

Use `config.additionalRates` for exact-route additions and `config.providerModes` for `metered`, `subscription` or `usage-only`. Each added price row needs an ISO `effectiveFrom`, string prices, and `null` for unknown prices. The Qwen example requires your actual provider ID and an applicable Beijing pay-as-you-go endpoint. Restart Harness after edits. Historical snapshots are preserved; new rules apply when loaded. No account balances, real provider API calls or automatic price updates are involved.
