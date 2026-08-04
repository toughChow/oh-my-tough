# VXLAN：在三层网络上构建二层 Overlay

VLAN 只能在相连的二层基础设施中传播。数据中心和多节点容器平台需要让不同物理主机上的工作负载看起来仍处于同一逻辑网络，这就是 Overlay 网络的典型需求。

VXLAN 把内层以太网帧封装到外层 UDP/IP 包中，让底层三层网络负责把封装包送到另一台主机。

## 1. Underlay 与 Overlay

```text
Overlay：租户/容器看到的逻辑网络
10.100.0.1  =================================  10.100.0.2
                 VXLAN 封装的内层帧

Underlay：真实可路由的宿主机网络
172.16.0.1  -------- 路由/交换网络 --------  172.16.0.2
```

- **Underlay** 必须先让 VXLAN 端点 IP 互通。
- **Overlay** 承载工作负载地址和内层以太网帧。
- **VTEP**（VXLAN Tunnel Endpoint）负责封装和解封装。
- **VNI** 是 24 位逻辑网络标识，用来区分不同 Overlay。

## 2. 一个 VXLAN 包长什么样

```text
外层 Ethernet
└── 外层 IP（VTEP A → VTEP B）
    └── UDP（常用目标端口 4789）
        └── VXLAN Header（包含 VNI）
            └── 内层 Ethernet
                └── 内层 IP（workload A → workload B）
```

底层路由器只需认识外层 VTEP IP，不需要认识每个容器或租户的 IP。VTEP 解封装之后，内层 bridge 再按 MAC 转发。

## 3. 已知单播与 BUM 流量

VTEP 需要知道“内层目标 MAC 应该发给哪个远端 VTEP”。来源可以是：

- 数据平面学习与泛洪。
- 静态 FDB。
- 使用 EVPN 等控制平面分发 MAC/IP 到 VTEP 的映射。

广播、未知单播和组播合称 BUM 流量。规模较小时可以复制到所有远端 VTEP；规模变大后，泛洪成本会成为重要设计问题。

## 4. 实验 5：在一台 Linux 中模拟两个 VXLAN 节点

拓扑：

```text
vx-c1             vx-n1                         vx-n2             vx-c2
10.100.0.1 ─ br-vx ─ VTEP 172.16.0.1 ===== VTEP 172.16.0.2 ─ br-vx ─ 10.100.0.2
                             underlay veth
```

创建四个 namespace：

```bash
ip netns add vx-n1
ip netns add vx-n2
ip netns add vx-c1
ip netns add vx-c2
```

创建 underlay 和客户端链路：

```bash
ip link add u1 type veth peer name u2
ip link set u1 netns vx-n1
ip link set u2 netns vx-n2

ip link add c1eth type veth peer name p1
ip link set c1eth netns vx-c1
ip link set p1 netns vx-n1

ip link add c2eth type veth peer name p2
ip link set c2eth netns vx-c2
ip link set p2 netns vx-n2
```

配置 underlay：

```bash
ip netns exec vx-n1 ip link set lo up
ip netns exec vx-n1 ip link set u1 up
ip netns exec vx-n1 ip addr add 172.16.0.1/24 dev u1

ip netns exec vx-n2 ip link set lo up
ip netns exec vx-n2 ip link set u2 up
ip netns exec vx-n2 ip addr add 172.16.0.2/24 dev u2

ip netns exec vx-n1 ping -c 2 172.16.0.2
```

先验证 underlay 成功，再创建两个 VTEP。节点 1：

```bash
ip netns exec vx-n1 ip link add br-vx type bridge
ip netns exec vx-n1 ip link set br-vx up
ip netns exec vx-n1 ip link set p1 master br-vx
ip netns exec vx-n1 ip link set p1 up
ip netns exec vx-n1 ip link set p1 mtu 1450

ip netns exec vx-n1 ip link add vx100 type vxlan id 100 local 172.16.0.1 remote 172.16.0.2 dstport 4789 dev u1
ip netns exec vx-n1 ip link set vx100 master br-vx
ip netns exec vx-n1 ip link set vx100 up
```

节点 2：

```bash
ip netns exec vx-n2 ip link add br-vx type bridge
ip netns exec vx-n2 ip link set br-vx up
ip netns exec vx-n2 ip link set p2 master br-vx
ip netns exec vx-n2 ip link set p2 up
ip netns exec vx-n2 ip link set p2 mtu 1450

ip netns exec vx-n2 ip link add vx100 type vxlan id 100 local 172.16.0.2 remote 172.16.0.1 dstport 4789 dev u2
ip netns exec vx-n2 ip link set vx100 master br-vx
ip netns exec vx-n2 ip link set vx100 up
```

配置 Overlay 中的两个客户端：

```bash
ip netns exec vx-c1 ip link set lo up
ip netns exec vx-c1 ip link set c1eth up
ip netns exec vx-c1 ip link set c1eth mtu 1450
ip netns exec vx-c1 ip addr add 10.100.0.1/24 dev c1eth

ip netns exec vx-c2 ip link set lo up
ip netns exec vx-c2 ip link set c2eth up
ip netns exec vx-c2 ip link set c2eth mtu 1450
ip netns exec vx-c2 ip addr add 10.100.0.2/24 dev c2eth
```

验证 Overlay：

```bash
ip netns exec vx-c1 ping -c 3 10.100.0.2
```

在节点 1 的 underlay 接口抓包，再次 ping：

```bash
ip netns exec vx-n1 tcpdump -n -i u1 udp port 4789
```

你会在底层看到 `172.16.0.1 → 172.16.0.2` 的 UDP 4789 流量，而客户端只知道内层 `10.100.0.0/24`。

查看 VXLAN 与 bridge 学习结果：

```bash
ip netns exec vx-n1 ip -d link show vx100
ip netns exec vx-n1 bridge fdb show br br-vx
```

## 5. MTU 预算

IPv4 VXLAN 常增加约 50 字节头部。如果 underlay MTU 为 1500，Overlay 端点常设置约 1450；IPv6 外层头更大时预算还要调整。

MTU 错误的典型现象：

- ping 小包正常，大包失败。
- TCP 握手成功，但 TLS 或文件传输卡住。
- 抓包看到重传，或收到 Fragmentation Needed / Packet Too Big。

不要盲目把所有接口 MTU 调得很小。应明确整条路径的最小 MTU 和封装开销。

## 6. Overlay 的取舍

优点：

- 工作负载地址与物理网络解耦。
- VNI 空间远大于传统 VLAN。
- 可跨三层 underlay 扩展逻辑二层网络。

代价：

- 额外封装与 MTU 管理。
- VTEP/FDB/控制平面状态增加。
- 抓包需要同时理解内层与外层。
- BUM 泛洪和多路径可观测性更复杂。

## 7. 清理

```bash
ip netns del vx-c1
ip netns del vx-c2
ip netns del vx-n1
ip netns del vx-n2
```

## 自测

1. Underlay 与 Overlay 分别需要认识哪些地址？
2. VTEP 的职责是什么？
3. VNI 与 VLAN ID 都用于隔离，它们的作用范围有何不同？
4. 为什么 VXLAN 网络更容易遇到 MTU 问题？

## 参考资料

- [Linux Kernel：VXLAN](https://docs.kernel.org/networking/vxlan.html)
- [RFC 7348：VXLAN](https://datatracker.ietf.org/doc/rfc7348/)

[下一章：IPv6 虚拟网络基础 →](./ipv6.md)
