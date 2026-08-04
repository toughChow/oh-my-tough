# 虚拟网络：从一根虚拟网线开始

虚拟网络不是另一套网络协议，而是用软件实现网卡、网线、交换机、路由器和防火墙。容器网络、Kubernetes CNI、云厂商 VPC，最终都建立在这些基础能力之上。

## 先建立一张知识地图

```text
应用进程
   │ socket
   ▼
network namespace       隔离网卡、IP、路由表、ARP 表和端口
   │
   ├── veth pair         一根两端相连的虚拟网线
   │
   ├── Linux bridge      二层虚拟交换机，按 MAC 地址转发
   │
   ├── route             三层选路，决定下一跳和出口网卡
   │
   ├── nftables          过滤、NAT 和端口转发
   │
   └── TUN/TAP、VXLAN    隧道与跨主机 Overlay 网络
```

刚开始只需要牢牢记住三个对象：

| 对象 | 类比 | 解决的问题 |
| --- | --- | --- |
| network namespace | 独立房间 | 把网络栈隔离开 |
| veth pair | 两头相通的网线 | 连接两个网络空间 |
| Linux bridge | 交换机 | 让多个二层节点互通 |

## 推荐学习方法

按“概念 → 预测 → 实验 → 解释结果”的顺序学习，不以“ping 通”为终点。每次执行命令前，先写下预期的出口接口、下一跳、MAC 解析对象和返回路径，再用路由查询、状态表与抓包验证。

## 课程结构

### 第一部分：基础数据路径

| 顺序 | 内容 | 学习结果 |
| --- | --- | --- |
| 1 | [概念篇：数据包如何流动](./packet-journey.md) | 建立二层、三层、namespace 和内核转发的心智模型 |
| 2 | [OrbStack 实验环境](./orbstack-setup.md) | 在 macOS 上准备可重复的 Linux 实验机 |
| 3 | [实验 1：同一子网](./lab-01-bridge.md) | 用 namespace、veth 和 bridge 验证 ARP 与二层交换 |
| 4 | [实验 2：跨子网](./lab-02-router.md) | 用路由表、默认网关和 IP forwarding 验证三层转发 |

### 第二部分：Linux 数据平面

| 顺序 | 内容 | 学习结果 |
| --- | --- | --- |
| 5 | [NAT 与 conntrack](./nat-conntrack.md) | 理解 SNAT、DNAT、masquerade 和双向连接状态 |
| 6 | [nftables 与状态防火墙](./firewall-policy.md) | 区分 INPUT、OUTPUT、FORWARD 与状态规则 |
| 7 | [VLAN 与二层隔离](./vlan-segmentation.md) | 理解 access、trunk、PVID 与跨 VLAN 路由 |
| 8 | [TUN/TAP 与用户态网络](./tuntap-vpn.md) | 理解 VPN 和虚拟机如何与内核交换包/帧 |
| 9 | [VXLAN 与 Overlay](./vxlan-overlay.md) | 区分 underlay、overlay、VTEP、VNI 和隧道 MTU |
| 10 | [IPv6 虚拟网络](./ipv6.md) | 掌握 NDP、RA、地址类型与 IPv6 防火墙边界 |

### 第三部分：平台映射

| 顺序 | 内容 | 学习结果 |
| --- | --- | --- |
| 11 | [Docker 网络](./docker-networking.md) | 把 bridge、端口发布、DNS 和 NAT 映射到内核对象 |
| 12 | [Kubernetes、CNI 与 Service](./kubernetes-networking.md) | 理解 Pod 网络、跨节点数据平面、Service 与 NetworkPolicy |
| 13 | [云 VPC](./cloud-vpc.md) | 把子网、路由表、NAT Gateway 和安全组放回统一模型 |

### 第四部分：工程能力

| 顺序 | 内容 | 学习结果 |
| --- | --- | --- |
| 14 | [系统化排错](./troubleshooting.md) | 按 namespace、接口、路由、邻居、策略和回程定位故障 |
| 15 | [综合设计与选型](./capstone.md) | 从需求选择 namespace、bridge、VLAN、VXLAN、NAT 与策略 |

## 开始前的准备

macOS 没有 Linux 的 `ip netns`、veth 和 Linux bridge，因此需要一个 Linux 环境。本教程使用 OrbStack 创建独立的 Ubuntu 实验机：

先阅读[概念篇](./packet-journey.md)，再按课程结构顺序完成。纯概念章节可以在任何设备阅读；标有“实验”的章节统一使用[OrbStack 实验环境](./orbstack-setup.md)。Docker 章节的命令在 Mac 终端执行，Kubernetes 实验仅在已有测试集群中执行。

::: tip 实验约定
所有网络对象都创建在专用 Ubuntu 机器中，并使用固定名称。每课末尾都有清理命令；即使操作失败，也不会改变 Mac 的真实网络配置。
:::

## 完成标准

- 能闭卷画出 namespace、veth、bridge、router 和 NAT 的数据路径。
- 能解释同子网与跨子网时 ARP 查询对象的区别。
- 能区分邻居表、bridge FDB、路由表、nftables 规则和 conntrack 表。
- 能解释 VLAN 与 VXLAN 分别在哪个范围提供隔离。
- 能从 Docker、Kubernetes 和 VPC 对象反推底层职责。
- 能用 `ip route get`、规则计数器和多点抓包定位故障区间。

完成最后的[综合设计题](./capstone.md)，并能逐跳解释 MAC、IP、端口、TTL 和封装变化，就算掌握了本专题。
