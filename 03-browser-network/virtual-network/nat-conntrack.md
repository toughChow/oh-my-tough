# NAT 与 conntrack：地址为什么会被改写

NAT（Network Address Translation）在数据包经过转发节点时改写 IP 地址或端口。它常被用于让私网共享公网地址、发布内网服务，以及解决地址空间重叠。

NAT 不是路由的替代品。内核仍需先判断数据包从哪里进入、应该从哪里离开，只是在数据路径的特定位置改写字段。

## 1. 三种常见 NAT

| 类型 | 改写内容 | 常见场景 |
| --- | --- | --- |
| SNAT | 源 IP/源端口 | 私网主动访问外部网络 |
| MASQUERADE | 动态选择出口接口地址做 SNAT | 出口 IP 可能变化的主机 |
| DNAT | 目标 IP/目标端口 | 端口发布、把公网流量转给内网服务 |

Docker 的默认 bridge 网络通常对容器出站流量做 masquerading；`docker run -p 8080:80` 则包含类似 DNAT 的入站端口发布过程。

## 2. 为什么私网访问互联网通常需要 SNAT

假设 namespace 中的主机地址是 `10.20.0.2`，它可以通过 Linux 路由器把请求送到互联网。但公网路由器不会为你的本地 `10.20.0.0/24` 保存回程路由。

```text
10.20.0.2                Linux 网关                 Internet
私网源地址  ─────────→  改写为网关出口地址  ─────────→
            ←─────────  根据连接状态还原     ←─────────
```

SNAT 把源地址改为网关可被回复的地址。响应到达网关后，内核再把目标还原成原来的私网地址。

## 3. conntrack 记录的不是“一条线”

Linux Netfilter 的 connection tracking 会把双向报文归为同一个流。一个 TCP/UDP 流通常可用五元组描述：

```text
协议 + 源 IP + 源端口 + 目标 IP + 目标端口
```

conntrack 同时记录原始方向和响应方向。以 SNAT 为例：

```text
原始方向：10.20.0.2:53000 → 203.0.113.8:443
线上看到：192.0.2.10:61001 → 203.0.113.8:443
响应方向：203.0.113.8:443 → 192.0.2.10:61001
还原之后：203.0.113.8:443 → 10.20.0.2:53000
```

状态化 NAT 通常只让流的第一个包查 NAT 规则并建立映射，后续数据包复用 conntrack 中的绑定。这也是 NAT 不只是“每个包做一次字符串替换”的原因。

常见连接状态：

- `new`：新连接的第一个或早期数据包。
- `established`：已观察到双向通信，或属于已有连接。
- `related`：与已有连接相关的新流，例如某些 ICMP 错误。
- `invalid`：无法正常归入连接状态。

## 4. SNAT 和 DNAT 为什么位置不同

简化后的 Netfilter 数据路径：

```text
进入接口
   │
   ▼
PREROUTING —— 常做 DNAT：先改目标，路由才知道真正送往哪里
   │
   ▼
路由判断 ──→ 本机 INPUT
   │
   └──────→ FORWARD
               │
               ▼
POSTROUTING —— 常做 SNAT：出口已确定，再选择合适源地址
               │
               ▼
            离开接口
```

本机自己产生的数据从 `OUTPUT` 开始，不经过入站 `PREROUTING`。排查规则不生效时，先确认数据包实际经过哪些 hook。

## 5. 实验 3：让 namespace 通过 NAT 访问外部网络

进入 OrbStack 实验机，并安装本章工具：

```bash
orb -m netlab -u root
apt update
apt install -y nftables conntrack
```

本实验让初始 namespace 充当网关：

```text
nat-host                  netlab 初始 namespace          外部网络
10.20.0.2  ←─ veth ─→  10.20.0.1 + 出口网卡  ───────→
```

创建主机与链路：

```bash
ip netns add nat-host
ip link add nat-host0 type veth peer name nat-gw0
ip link set nat-host0 netns nat-host

ip addr add 10.20.0.1/24 dev nat-gw0
ip link set nat-gw0 up

ip netns exec nat-host ip link set lo up
ip netns exec nat-host ip link set nat-host0 up
ip netns exec nat-host ip addr add 10.20.0.2/24 dev nat-host0
ip netns exec nat-host ip route add default via 10.20.0.1
```

先确认主机只能到达网关：

```bash
ip netns exec nat-host ping -c 2 10.20.0.1
ip netns exec nat-host ping -c 2 -W 1 1.1.1.1
```

开启转发并找到实验机的真实出口：

```bash
sysctl -w net.ipv4.ip_forward=1
WAN_IF=$(ip route show default | awk '/default/ {print $5; exit}')
echo "$WAN_IF"
```

添加 nftables NAT 表和 masquerade 规则：

```bash
nft add table ip netlab_nat
nft 'add chain ip netlab_nat postrouting { type nat hook postrouting priority srcnat; policy accept; }'
nft add rule ip netlab_nat postrouting ip saddr 10.20.0.0/24 oifname "$WAN_IF" masquerade
nft list table ip netlab_nat
```

再次测试：

```bash
ip netns exec nat-host ping -c 3 1.1.1.1
ip netns exec nat-host ping -c 2 example.com
```

发起流量的同时，在另一个终端观察连接状态：

```bash
orb -m netlab -u root conntrack -L
```

还可以分别在私网端和出口抓包。你会看到同一个 ICMP 请求在两个接口上使用不同源地址：

```bash
tcpdump -n -i nat-gw0 icmp
tcpdump -n -i "$WAN_IF" icmp
```

## 6. 端口发布的数据路径

外部访问 `网关IP:8080` 并转发给 `10.20.0.2:80` 时，典型过程是：

1. `PREROUTING` DNAT 把目标改成 `10.20.0.2:80`。
2. 路由表根据新目标选择私网接口。
3. `FORWARD` 防火墙决定是否允许。
4. 响应方向由 conntrack 自动应用反向映射。

如果服务在网关本机，数据可能经过 `INPUT`；如果服务在 namespace 或另一台主机，通常经过 `FORWARD`。两者的防火墙规则不能混为一谈。

## 7. NAT 的代价与边界

- 改写地址让端到端观察和排错更复杂。
- conntrack 表容量有限，高连接量需要关注耗尽与超时。
- 某些在应用层携带地址的协议需要额外处理。
- NAT 不能替代防火墙；地址被隐藏不等于访问被授权。
- IPv6 通常更强调端到端路由与防火墙，而不是依赖地址共享 NAT。

## 8. 清理实验

```bash
nft delete table ip netlab_nat
ip netns del nat-host
ip link del nat-gw0 2>/dev/null || true
sysctl -w net.ipv4.ip_forward=0
unset WAN_IF
```

## 自测

1. SNAT 与 DNAT 分别改写哪个方向的地址？
2. 为什么 DNAT 通常需要发生在路由判断之前？
3. 为什么响应包不需要再手写一条完全相反的 NAT 规则？
4. 能路由到互联网但没有 SNAT 时，问题通常出在去程还是回程？

## 参考资料

- [nftables：Performing Network Address Translation](https://wiki.nftables.org/wiki-nftables/index.php/Performing_Network_Address_Translation_%28NAT%29)
- [nftables：Connection Tracking System](https://wiki.nftables.org/wiki-nftables/index.php/Connection_Tracking_System)

[下一章：nftables 与状态防火墙 →](./firewall-policy.md)

