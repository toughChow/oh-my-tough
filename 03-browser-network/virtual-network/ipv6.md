# IPv6 虚拟网络基础

虚拟网络的接口、namespace、bridge 和路由模型同样适用于 IPv6，但邻居发现、地址配置和公网连通方式与 IPv4 有明显不同。

## 1. IPv6 不只是“更长的 IP”

需要优先掌握的变化：

- 地址长度为 128 位，常使用 `/64` 子网。
- 没有 IPv4 风格的广播，使用组播完成邻居发现等工作。
- NDP（Neighbor Discovery Protocol）替代 ARP。
- 主机可通过 Router Advertisement 获取前缀和默认路由。
- 地址会执行 DAD（Duplicate Address Detection）检查重复。
- 设计上通常不依赖地址共享 NAT，安全主要由路由与防火墙控制。

## 2. 常见地址类型

| 类型 | 示例 | 作用范围 |
| --- | --- | --- |
| Link-local | `fe80::/10` | 仅当前二层链路，每个接口通常自动拥有 |
| ULA | `fc00::/7`，实践常用 `fd00::/8` | 私有组织内部规划，不直接作为全球公网地址 |
| Global Unicast | `2000::/3` | 可全球路由，是否可达仍由路由和策略决定 |
| Multicast | `ff00::/8` | 一对多，替代多种广播用途 |
| Loopback | `::1/128` | 本机回环 |

同一个接口同时拥有 link-local、ULA 和 global 地址是正常情况。IPv6 的“一个接口一个地址”心智模型往往不成立。

## 3. NDP 做了哪些事

NDP 基于 ICMPv6，承担：

- Neighbor Solicitation / Advertisement：解析邻居链路层地址，类似 ARP。
- Router Solicitation / Advertisement：发现路由器、前缀和默认路由。
- Redirect：提示更合适的下一跳。
- DAD：地址启用前检查是否重复。

因此随意阻断所有 ICMPv6 会破坏 IPv6 的基础功能。防火墙策略应区分必要的 ICMPv6 类型，而不是照搬“禁 ping”。

## 4. SLAAC、DHCPv6 与静态配置

- **静态配置**：手动指定地址与路由，适合本教程实验。
- **SLAAC**：主机根据 RA 中的前缀自动生成地址。
- **DHCPv6**：可分配地址或其他配置，但默认网关仍通常来自 RA。

容器平台和云网络可能由 IPAM/CNI/云控制面直接分配 IPv6 地址，不一定依赖局域网中的传统 SLAAC 流程。

## 5. 实验 6：两个 namespace 的 IPv6 同子网通信

创建 bridge 与两个客户端：

```bash
ip netns add ip6-a
ip netns add ip6-b
ip link add ip6a type veth peer name ip6p1
ip link add ip6b type veth peer name ip6p2
ip link set ip6a netns ip6-a
ip link set ip6b netns ip6-b

ip link add ip6-br0 type bridge
ip link set ip6-br0 up
ip link set ip6p1 master ip6-br0
ip link set ip6p2 master ip6-br0
ip link set ip6p1 up
ip link set ip6p2 up
```

配置 ULA 地址：

```bash
ip netns exec ip6-a ip link set lo up
ip netns exec ip6-a ip link set ip6a up
ip netns exec ip6-a ip -6 addr add fd42:10::1/64 dev ip6a

ip netns exec ip6-b ip link set lo up
ip netns exec ip6-b ip link set ip6b up
ip netns exec ip6-b ip -6 addr add fd42:10::2/64 dev ip6b
```

观察地址、路由与邻居发现：

```bash
ip netns exec ip6-a ip -6 addr
ip netns exec ip6-a ip -6 route
ip netns exec ip6-a ping -6 -c 3 fd42:10::2
ip netns exec ip6-a ip -6 neigh
```

抓包时会看到 ICMPv6 Neighbor Solicitation/Advertisement，而不是 ARP：

```bash
ip netns exec ip6-a tcpdump -n -i ip6a icmp6
```

## 6. IPv6 与 NAT

IPv6 地址充足，不需要用 NAT44 的地址复用方式解决公网地址不足。主机可以拥有全局地址，同时用有状态防火墙限制入站连接。

这不代表 IPv6 自动暴露所有服务：

- 路由必须存在。
- 云安全组、主机防火墙和 NetworkPolicy 仍可能阻止访问。
- 应用必须监听 IPv6 地址。
- DNS 需要提供 AAAA 记录。

排错时还要避免“IPv4 通，所以双栈服务一定正常”的假设。

## 7. 清理

```bash
ip netns del ip6-a
ip netns del ip6-b
ip link del ip6-br0
```

## 自测

1. IPv6 使用什么机制替代 ARP？
2. link-local 地址为什么经常需要同时指定接口？
3. DHCPv6 是否一定负责默认网关？
4. IPv6 不依赖地址共享 NAT，为什么仍需要防火墙？

[下一章：Docker 网络如何映射这些内核对象 →](./docker-networking.md)

