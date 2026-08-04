# nftables 与状态防火墙

路由决定“可以从哪儿走”，防火墙决定“是否允许走”。二者都可能让数据包消失，但排查方法不同。

本章使用 nftables。它是 Linux 内核 Netfilter 的现代规则配置接口；iptables 是较早的用户态接口，在很多系统上仍然常见。

## 1. 包过滤的三个维度

一条规则通常由匹配条件和动作组成：

```text
匹配：入口接口、出口接口、源/目标地址、协议、端口、连接状态……
动作：accept、drop、reject、log、counter、jump……
```

- `accept`：允许继续通过当前过滤点。
- `drop`：静默丢弃，对端通常等待超时。
- `reject`：丢弃并明确回复错误，失败更快。
- `counter`：累计命中包数和字节数，是排错的重要证据。

## 2. INPUT、OUTPUT 与 FORWARD

判断链时，不要看“客户端还是服务端”，而要看数据包相对当前 Linux 网络栈的关系：

| 数据路径 | 典型链 |
| --- | --- |
| 外部访问这台 Linux 自己的服务 | INPUT |
| 这台 Linux 自己访问外部 | OUTPUT |
| Linux 在两个接口之间替别人转发 | FORWARD |

容器端口发布经常同时涉及 DNAT 和 FORWARD；只放行宿主机 INPUT 不一定能让容器服务被访问。

## 3. 无状态与有状态规则

无状态规则逐包判断，例如“允许所有目标端口为 443 的 TCP 包”。它不会自动理解这个包属于新连接、既有连接还是伪造响应。

状态防火墙结合 conntrack：

```text
ct state established,related accept
```

这条规则表示：已经被允许建立的连接，其返回流量和相关流量可以通过。常见策略是：

1. 先丢弃 `invalid`。
2. 放行 `established,related`。
3. 精确放行需要创建的新连接。
4. 默认拒绝其他流量。

这种顺序既减少规则量，也能表达“允许内部主动访问外部，但不允许外部随意发起连接”。

## 4. nftables 的层级结构

```text
ruleset
└── table（规则的命名空间和协议族）
    └── chain（绑定 hook 或被其他链调用）
        └── rule（从上到下求值）
```

常见 family：

- `ip`：只处理 IPv4。
- `ip6`：只处理 IPv6。
- `inet`：同时处理 IPv4 和 IPv6，适合普通过滤。
- `bridge`：观察二层 bridge 路径。

普通 `inet`/`ip` 过滤链不会天然看到所有纯二层 bridge 转发流量。二层过滤要明确理解 bridge family 与 bridge netfilter 的差异。

## 5. 实验：给上一课的路由器加默认拒绝策略

先按[实验 2](./lab-02-router.md)重新创建 `rt-h1`、`rt-router`、`rt-h2`，配置默认路由并开启 `rt-router` 的 IP forwarding，但暂时不要清理。

在路由器 namespace 中创建一条默认拒绝的 FORWARD 链：

```bash
ip netns exec rt-router nft add table inet lab_filter
ip netns exec rt-router nft 'add chain inet lab_filter forward { type filter hook forward priority filter; policy drop; }'
```

添加状态与业务规则：

```bash
ip netns exec rt-router nft add rule inet lab_filter forward ct state invalid counter drop
ip netns exec rt-router nft add rule inet lab_filter forward ct state established,related counter accept
ip netns exec rt-router nft add rule inet lab_filter forward iifname "r1eth" oifname "r2eth" ip protocol icmp counter accept
```

从左向右发起 ping：

```bash
ip netns exec rt-h1 ping -c 3 10.10.2.2
```

请求被第三条规则允许，响应被 `established` 规则允许。反方向主动发起的新 ping 应失败：

```bash
ip netns exec rt-h2 ping -c 2 -W 1 10.10.1.2
```

查看计数器：

```bash
ip netns exec rt-router nft -a list table inet lab_filter
```

计数器不增长，通常说明数据没经过你以为的链，或前面的规则已经结束求值；计数器增长但仍失败，则继续检查后续路径与回程。

临时允许反方向 ICMP：

```bash
ip netns exec rt-router nft add rule inet lab_filter forward iifname "r2eth" oifname "r1eth" ip protocol icmp counter accept
ip netns exec rt-h2 ping -c 2 10.10.1.2
```

## 6. drop 还是 reject

| 动作 | 客户端体验 | 常见用途 |
| --- | --- | --- |
| drop | 等待重传并最终超时 | 不希望暴露策略、处理明显恶意流量 |
| reject | 立即收到不可达或 TCP reset | 内部网络、希望快速反馈配置错误 |

“更安全”不能只按是否静默判断。生产策略应兼顾攻击面、可观测性和客户端重试成本。

## 7. 规则设计原则

- 默认拒绝前，先明确管理连接和回滚路径。
- 对新连接收紧，对已建立返回流量使用状态匹配。
- 将计数器放在关键规则上，不要只靠日志。
- 地址、端口较多时使用 set，减少重复规则。
- 规则文件应可原子加载和版本管理。
- 防火墙规则和路由、NAT 一起审查，因为它们共享数据路径。

## 8. 清理

```bash
ip netns exec rt-router nft delete table inet lab_filter
ip netns del rt-h1
ip netns del rt-h2
ip netns del rt-router
```

## 自测

1. 访问路由器本机服务与访问路由器后面的主机分别经过 INPUT 还是 FORWARD？
2. `established,related` 为什么通常放在靠前位置？
3. 默认策略为 drop 时，只允许请求方向为什么仍可能失败？
4. 规则计数器为零能说明什么？

## 参考资料

- [nftables 官方 Wiki](https://wiki.nftables.org/)
- [Linux bridge 与 Netfilter 的边界](https://docs.kernel.org/networking/bridge.html)

[下一章：VLAN 与二层隔离 →](./vlan-segmentation.md)

