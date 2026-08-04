# 云 VPC：把路由、NAT 和策略变成托管对象

VPC（Virtual Private Cloud）为租户提供逻辑隔离的地址空间、子网、路由和安全策略。底层可能是分布式路由、虚拟交换、Overlay 和硬件卸载，但使用者仍可沿用前面建立的数据包模型。

本章以通用概念为主，并用 AWS 名称举例。不同云厂商的具体默认行为和资源边界需要查对应文档。

## 1. VPC 对象与 Linux 概念映射

| 云对象 | 对应心智模型 |
| --- | --- |
| VPC CIDR | 租户可使用的逻辑地址空间 |
| Subnet | 一段地址前缀及其故障域/可用区归属 |
| ENI/虚拟网卡 | 工作负载接入 VPC 的网络接口 |
| Route table | 目标前缀到下一跳资源的规则 |
| Internet Gateway | VPC 与公网之间的受管边界 |
| NAT Gateway | 私网 IPv4 出站地址转换 |
| Security Group | 绑定实例/网卡的有状态策略 |
| Network ACL | 绑定子网边界的规则；AWS 中为无状态 |
| Peering/Transit Gateway | VPC 之间的路由连接 |
| VPN/专线 | 云与本地网络的加密或专用 underlay |

子网在云中不一定等于一个传统 VLAN。它更重要的含义是地址前缀、路由表关联和可用区边界。

## 2. 路由表仍然使用最长前缀匹配

云路由通常由目标和 target 组成：

```text
10.0.0.0/16     local
10.20.0.0/16    peering-xxx
0.0.0.0/0       nat-gateway-xxx
```

- `local` 允许 VPC 内不同子网通过云路由互通，实际是否允许还受安全策略影响。
- 更具体的对等连接路由优先于默认路由。
- 默认路由只负责兜底，不代表 target 一定能把包送到最终目标。

排查时要同时检查源子网路由表和返回方向路由表。

## 3. “公有子网”不是自动公开

通常把具有 `0.0.0.0/0 → Internet Gateway` 路由的子网称为公有子网。但实例被互联网访问还需要：

- 实例或网卡具有可用的公网 IPv4/IPv6 地址。
- Internet Gateway 路径存在。
- Security Group 和 Network ACL 允许。
- 操作系统防火墙允许。
- 应用监听正确地址和端口。

路由只说明路径，不能单独表达服务是否公开。

## 4. 私有子网出站

典型 IPv4 路径：

```text
private instance
→ private subnet route table
→ NAT Gateway（位于公有子网）
→ Internet Gateway
→ Internet
```

NAT Gateway 需要自己的公网连接，私有实例的默认路由指向 NAT Gateway。外部看到的是 NAT 出口地址，不能仅凭这条出站映射主动访问内部实例。

IPv6 地址充足，通常不使用 NAT44 式地址共享；AWS 等平台提供 egress-only Internet Gateway 这类只允许主动出站连接的路由边界。

## 5. Security Group 与 Network ACL

以 AWS 为例：

| 特性 | Security Group | Network ACL |
| --- | --- | --- |
| 绑定范围 | 实例/ENI | 子网 |
| 状态 | 有状态 | 无状态 |
| 返回流量 | 已允许连接自动允许返回 | 必须显式允许双向规则 |
| 规则动作 | 允许规则 | 允许与拒绝规则 |

其他云厂商的名称与语义可能不同，不能机械套用。

有状态安全组中的“自动允许返回”来自连接状态，不代表返回方向存在路由。策略允许与路由可达仍是两个条件。

## 6. 两层应用的数据路径

```text
Internet
  ↓
Load Balancer（公有子网）
  ↓ SG: 仅允许 LB → App
App instances（私有子网）
  ↓ SG: 仅允许 App → DB
Database（隔离子网）
```

这里至少有三类独立问题：

1. **路由问题**：子网是否知道下一跳与回程。
2. **策略问题**：SG/NACL 是否允许协议和端口。
3. **服务问题**：负载均衡目标健康、应用监听、数据库权限。

不要看到 timeout 就立刻修改所有安全组。先确定数据包在哪一层停止。

## 7. VPC 连接与地址规划

VPC Peering、Transit Gateway、VPN 和专线都需要路由传播或静态路由。最常见的前置约束是 CIDR 不能重叠。

地址规划建议：

- 为增长、可用区和环境预留连续空间。
- 避免与办公网、合作方、其他云重复。
- 不要把“当前实例数量”直接等同于所需子网大小。
- 同时规划 IPv4 与 IPv6，避免后续双栈割裂。
- 把路由域、故障域和安全域分别思考，不要假设一个 subnet 能同时完美表达三者。

地址已重叠时，NAT 可以临时解决部分通信，但会增加双向连接、日志定位和服务发现复杂度。

## 8. 云网络排错证据

- 实例网卡：私网/公网地址、源/目标检查等属性。
- 子网路由表：目标前缀和下一跳资源状态。
- Security Group：源/目标引用、协议和端口。
- Network ACL：入站与出站规则、临时端口范围。
- Flow Logs：看到 ACCEPT/REJECT 及五元组，但不等于完整抓包。
- Reachability Analyzer：静态分析可能路径和阻断点。
- 实例内部：路由、DNS、监听端口和主机防火墙。

云控制面显示“资源可用”，不代表应用数据面已经端到端成功。

## 9. 自测

1. 公有子网中的实例为什么仍可能无法被互联网访问？
2. Security Group 允许返回流量，为什么回包仍可能丢失？
3. NAT Gateway 与 Internet Gateway 分别解决什么问题？
4. 两个 VPC CIDR 重叠会给路由带来什么歧义？

## 参考资料

- [AWS：How Amazon VPC works](https://docs.aws.amazon.com/vpc/latest/userguide/how-it-works.html)
- [AWS：Configure route tables](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)
- [AWS：VPC basics](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-subnet-basics.html)

[下一章：虚拟网络系统化排错 →](./troubleshooting.md)

