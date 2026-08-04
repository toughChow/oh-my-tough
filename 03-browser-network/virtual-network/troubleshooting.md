# 虚拟网络系统化排错

网络排错最怕“同时改很多地方，偶然通了却不知道原因”。稳定的方法是先画出预期数据路径，再在关键边界收集证据，定位数据包最后出现的位置。

## 1. 先写清一条流

不要只写“访问不了数据库”，至少记录：

```text
源 namespace / Pod / VM：
源 IP 与临时端口：
目标名称、解析后的 IP 与端口：
协议：TCP / UDP / ICMP：
预期经过的网关、bridge、VTEP、NAT：
失败表现：立即拒绝 / 超时 / 重置 / 解析失败：
```

五元组相同、方向不同的返回流量也要检查。很多问题发生在回程，而不是请求方向。

## 2. 第一原则：你现在在哪个网络空间

同一个命令在宿主机、容器、Pod 或路由器 namespace 中会看到完全不同结果。

```bash
ip netns list
ip netns identify $$
ls -l /proc/$$/ns/net
```

对目标 namespace 执行：

```bash
ip netns exec NAME ip -br addr
ip netns exec NAME ip route
```

容器环境可通过对应运行时进入；不要在宿主机看到路由正常，就推断容器内部也正常。

## 3. 从本地到远端的十步检查

### 3.1 进程是否真的监听

```bash
ss -lntup
```

重点区分：

- `127.0.0.1:8080`：只接受本 namespace 回环访问。
- `0.0.0.0:8080`：监听所有 IPv4 本地地址。
- `[::]:8080`：监听 IPv6；是否同时接受 IPv4 取决于系统设置。

连接被立即 `Connection refused`，常表示路径可达但没有进程监听，或防火墙主动 reject。

### 3.2 接口是否存在且启用

```bash
ip -br link
ip -br addr
ip -d link show DEV
```

检查接口类型、UP/DOWN、master bridge、VLAN、VXLAN VNI、MTU 和 namespace 归属。

### 3.3 IP 与掩码是否正确

错误掩码会让主机错误判断目标是否直连。例如本应跨网关的目标被误认为同子网，主机会不断 ARP，而不是交给网关。

```bash
ip addr show dev DEV
```

### 3.4 内核到底选择哪条路

```bash
ip route get 目标IPv4
ip -6 route get 目标IPv6
ip rule show
ip route show table all
```

`ip route get` 比只读路由表更直接，它会给出实际出口、下一跳和源地址。存在策略路由时，还要检查 `ip rule` 与其他路由表。

### 3.5 下一跳是否可解析

```bash
ip neigh
ip -6 neigh
```

常见状态：

- `REACHABLE/STALE/DELAY`：不一定有问题，STALE 只是缓存尚未近期验证。
- `INCOMPLETE`：正在解析但未收到响应。
- `FAILED`：邻居解析失败，优先检查二层链路、VLAN 和目标状态。

### 3.6 二层交换是否正确

```bash
bridge link
bridge fdb show
bridge vlan show
```

检查 veth 宿主端是否接入预期 bridge、VLAN PVID/tagged 配置是否一致、目标 MAC 是否被学习到正确端口。

### 3.7 路由器是否真的转发

```bash
sysctl net.ipv4.ip_forward
sysctl net.ipv6.conf.all.forwarding
```

能 ping 两侧网关但不能跨子网，是转发开关、防火墙或回程路由的典型信号。

### 3.8 防火墙规则是否命中

```bash
nft -a list ruleset
```

优先看：

- 数据经过 INPUT 还是 FORWARD。
- 默认 policy。
- 规则顺序。
- counter 是否增长。
- conntrack 状态匹配。

不要直接清空整套规则作为第一步。先增加计数器或临时精确规则验证假设。

### 3.9 NAT 与连接状态是否正常

```bash
conntrack -L
nft list ruleset
```

检查 NAT 规则的 family、hook、优先级、源网段和出口接口。修改 NAT 规则后，已有 conntrack 条目可能继续使用旧映射，测试时要创建新连接，必要时只删除对应测试流状态。

### 3.10 回程是否存在

在目标一侧反向执行：

```bash
ip route get 源IP
```

若去程和回程经过不同状态防火墙、NAT 或负载均衡器，还要检查非对称路由是否被允许。

## 4. 抓包：在边界上验证，而不是漫无目的地看

常用命令：

```bash
tcpdump -nn -e -i DEV
tcpdump -nn -i DEV host 10.0.0.8
tcpdump -nn -i DEV tcp port 443
tcpdump -nn -i DEV 'arp or icmp or icmp6'
tcpdump -nn -i DEV udp port 4789
```

选取关键观察点：

```text
源应用 namespace
→ veth 源端
→ bridge/路由器入口
→ 路由器出口
→ VXLAN underlay
→ 目标节点入口
→ 目标 namespace
```

如果某点看得到、下一个点看不到，问题就在两点之间。若字段发生变化，判断它是否来自预期的 NAT、隧道封装或代理。

抓包中的重要信号：

- ARP Request 反复出现但无 Reply：二层或目标地址问题。
- TCP SYN 重传：请求或返回 SYN-ACK 丢失。
- 收到 RST：路径通常已到达某个明确拒绝连接的节点。
- ICMP Unreachable：阅读 code，可能是网络、主机、端口或策略不可达。
- Fragmentation Needed / Packet Too Big：MTU/PMTUD 线索。

## 5. MTU 黑洞

典型现象：

- 小 ping 正常，大 ping 失败。
- TCP 三次握手成功，发送较大数据后重传。
- VXLAN/VPN 环境中特别容易出现。

检查：

```bash
ip link show DEV
tracepath 目标IP
ping -M do -s 1400 目标IPv4
```

不要屏蔽所有 ICMP/ICMPv6。Path MTU Discovery 依赖相关错误报文；错误过滤会把可诊断的“包太大”变成静默超时。

## 6. DNS 问题与网络问题分开

先比较：

```bash
getent hosts example.com
ping -c 1 1.1.1.1
ping -c 1 example.com
cat /etc/resolv.conf
```

- IP 访问成功、名称失败：重点检查 DNS。
- DNS 解析成功、TCP 失败：继续检查目标端口和数据路径。
- 容器/Pod 中应在其自己的 namespace 内测试解析。

Kubernetes 中还要检查 DNS Service、EndpointSlice 和 NetworkPolicy 是否允许 DNS 的 UDP/TCP 53。

## 7. 症状速查表

| 现象 | 高概率方向 |
| --- | --- |
| `Network is unreachable` | 本机没有匹配路由 |
| `No route to host` | 路由、邻居解析或 reject 返回 |
| `Connection refused` | 无监听服务、目标主动拒绝 |
| 一直 timeout | 静默 drop、回程缺失、目标不可达 |
| 同子网不通且邻居 FAILED | veth/bridge/VLAN/目标接口 |
| 能到网关，不能跨网段 | forwarding、防火墙、回程路由 |
| 能访问 IP，不能访问域名 | DNS |
| 容器内能访问，宿主机端口不能访问 | 端口发布、绑定地址、FORWARD |
| VXLAN 小包通大包不通 | MTU/PMTUD |
| Service 不通但 Pod IP 通 | selector、EndpointSlice、服务代理规则 |

## 8. 记录一次可复现排错

每次故障至少保存：

1. 拓扑和五元组。
2. 源与目标的 `ip -br addr`、`ip route get`。
3. 中间节点 forwarding、nftables 和 conntrack 状态。
4. 两到三个关键接口的抓包时间点。
5. 唯一做出的变更及变更前后结果。

这样才能把“重启后好了”升级成可解释、可预防的工程结论。

## 自测

1. 为什么排错第一步要确认 namespace？
2. `ip route get` 比只看 `ip route` 多提供了什么价值？
3. 规则计数器增长但连接仍失败，下一步应检查什么？
4. 为什么禁止所有 ICMP 会让 MTU 问题更难定位？

[下一章：综合设计与选型速查 →](./capstone.md)

