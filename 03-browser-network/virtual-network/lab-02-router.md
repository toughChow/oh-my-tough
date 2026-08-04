# 实验 2：用 Linux 路由器连接两个子网

## 本课目标

把两台主机放入不同子网，通过第三个 namespace 充当路由器。你将分别验证主机路由、默认网关和 Linux IP 转发。

```text
namespace: rt-h1            namespace: rt-router             namespace: rt-h2
10.10.1.2/24          10.10.1.1/24    10.10.2.1/24          10.10.2.2/24
    h1eth <----------> r1eth              r2eth <----------> h2eth
```

进入实验机：

```bash
orb -m netlab -u root
```

## 1. 创建三台虚拟主机和两根网线

```bash
ip netns add rt-h1
ip netns add rt-router
ip netns add rt-h2

ip link add h1eth type veth peer name r1eth
ip link add h2eth type veth peer name r2eth

ip link set h1eth netns rt-h1
ip link set r1eth netns rt-router
ip link set h2eth netns rt-h2
ip link set r2eth netns rt-router
```

这里没有 bridge：每对 veth 都是主机与路由器之间的点对点二层链路。

## 2. 配置 IP 和网卡状态

配置左侧主机：

```bash
ip netns exec rt-h1 ip link set lo up
ip netns exec rt-h1 ip link set h1eth up
ip netns exec rt-h1 ip addr add 10.10.1.2/24 dev h1eth
```

配置路由器的两个接口：

```bash
ip netns exec rt-router ip link set lo up
ip netns exec rt-router ip link set r1eth up
ip netns exec rt-router ip link set r2eth up
ip netns exec rt-router ip addr add 10.10.1.1/24 dev r1eth
ip netns exec rt-router ip addr add 10.10.2.1/24 dev r2eth
```

配置右侧主机：

```bash
ip netns exec rt-h2 ip link set lo up
ip netns exec rt-h2 ip link set h2eth up
ip netns exec rt-h2 ip addr add 10.10.2.2/24 dev h2eth
```

## 3. 先验证两段直连网络

```bash
ip netns exec rt-h1 ping -c 2 10.10.1.1
ip netns exec rt-h2 ping -c 2 10.10.2.1
```

两次都应成功，因为主机与对应的路由器接口属于同一子网。

接着从左侧访问右侧：

```bash
ip netns exec rt-h1 ping -c 2 -W 1 10.10.2.2
```

此时失败。让内核解释它会如何选路：

```bash
ip netns exec rt-h1 ip route
ip netns exec rt-h1 ip route get 10.10.2.2
```

`rt-h1` 只知道 `10.10.1.0/24`，没有通往 `10.10.2.0/24` 的路由。

## 4. 给两台主机配置默认网关

```bash
ip netns exec rt-h1 ip route add default via 10.10.1.1
ip netns exec rt-h2 ip route add default via 10.10.2.1
```

再次查询选路：

```bash
ip netns exec rt-h1 ip route get 10.10.2.2
```

预期会看到类似结果：

```text
10.10.2.2 via 10.10.1.1 dev h1eth src 10.10.1.2
```

这表示数据包应该交给 `h1eth` 上的下一跳 `10.10.1.1`。

## 5. 开启路由器的 IP 转发

先明确关闭转发，再测试一次：

```bash
ip netns exec rt-router sysctl -w net.ipv4.ip_forward=0
ip netns exec rt-h1 ping -c 2 -W 1 10.10.2.2
```

路由器拥有两个子网的直连路由，但 `ip_forward=0` 时只接收发给自己的数据，不替其他主机转发。

开启转发：

```bash
ip netns exec rt-router sysctl -w net.ipv4.ip_forward=1
ip netns exec rt-h1 ping -c 3 10.10.2.2
```

跨子网通信现在应该成功。

## 6. 逐跳理解数据包

从 `10.10.1.2` 发往 `10.10.2.2` 时：

1. `rt-h1` 发现目标不在本地子网，查询默认路由。
2. 它 ARP 查询的是网关 `10.10.1.1`，不是远端主机。
3. 第一段以太网帧的目标 MAC 是 `r1eth` 的 MAC。
4. 路由器拆掉二层帧、把 IP TTL 减一，再查询自己的路由表。
5. 路由器在右侧链路 ARP 查询 `10.10.2.2`。
6. 路由器用新的源 MAC 和目标 MAC 封装帧，从 `r2eth` 发出。
7. `rt-h2` 通过默认网关把响应送回。

所以，端到端传输时通常保持源/目标 IP 不变；每经过一段二层链路，源/目标 MAC 会重写；每经过一个路由器，TTL 会减一。

验证邻居表：

```bash
ip netns exec rt-h1 ip neigh
ip netns exec rt-router ip neigh
ip netns exec rt-h2 ip neigh
```

注意：`rt-h1` 应该只学习网关 `10.10.1.1` 的 MAC，而不是远端 `10.10.2.2` 的 MAC。

## 7. 三个条件缺一不可

| 条件 | 缺失时的典型现象 | 检查命令 |
| --- | --- | --- |
| 接口和 IP 正确 | 连网关都 ping 不通 | `ip -br addr` |
| 主机有正确路由 | `Network is unreachable` | `ip route get 目标IP` |
| 路由器允许转发 | 能 ping 网关，不能跨子网 | `sysctl net.ipv4.ip_forward` |

如果配置看起来正确仍然失败，再检查防火墙：

```bash
ip netns exec rt-router nft list ruleset
```

新 namespace 默认通常没有拦截规则，不需要为了实验随意清空宿主机防火墙。

## 8. 清理实验

```bash
ip netns del rt-h1
ip netns del rt-h2
ip netns del rt-router
```

确认清理结果：

```bash
ip netns list
```

## 本课自测

1. 默认路由和直连路由同时匹配时，内核选择哪条？
2. `rt-h1` 为什么不需要知道 `rt-h2` 的 MAC？
3. 路由器转发一次，IP、MAC 和 TTL 分别如何变化？
4. 为什么回程路由同样重要？

下一阶段可以在路由器上加入 NAT，让私网主机访问外部网络，再把同样的结构映射到 Docker bridge 网络。

