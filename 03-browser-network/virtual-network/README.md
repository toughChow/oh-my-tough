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

## 推荐学习顺序

1. **同一子网互通**：namespace、veth、bridge、ARP、MAC 地址表。
2. **跨子网互通**：路由表、默认网关、IP forwarding、TTL。
3. **访问外部网络**：SNAT、MASQUERADE、连接跟踪。
4. **容器网络**：Docker bridge、端口映射、容器 DNS。
5. **跨主机网络**：VXLAN、Overlay、CNI 和 NetworkPolicy。

本专题先完成前两步。实验不是以“ping 通”为终点，而是要求你能预测数据包下一步会去哪里，并用命令验证预测。

## 开始前的准备

macOS 没有 Linux 的 `ip netns`、veth 和 Linux bridge，因此需要一个 Linux 环境。本教程使用 OrbStack 创建独立的 Ubuntu 实验机：

1. [搭建 OrbStack 实验环境](./orbstack-setup.md)
2. [实验 1：network namespace、veth 与 Linux bridge](./lab-01-bridge.md)
3. [实验 2：用 Linux 路由器连接两个子网](./lab-02-router.md)

::: tip 实验约定
所有网络对象都创建在专用 Ubuntu 机器中，并使用固定名称。每课末尾都有清理命令；即使操作失败，也不会改变 Mac 的真实网络配置。
:::

## 学完后的自测

- namespace 隔离了哪些网络资源？
- veth 为什么必须成对出现？
- 同一子网通信为什么不需要默认网关？
- 主机访问远端子网时，ARP 查询的是目标主机还是网关？
- 路由器转发数据包时，哪些字段会改变？

如果能不看答案画出两课的拓扑，并逐跳解释 MAC、IP 和 TTL 的变化，就算真正掌握了这一阶段。

