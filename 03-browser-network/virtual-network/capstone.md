# 综合篇：从需求选择虚拟网络组件

学完所有对象后，最重要的能力不是背命令，而是把需求拆成隔离、连接、交换、路由、封装、策略和可观测性，再为每一层选择最小必要组件。

## 1. 组件选型速查

| 需求 | 优先考虑 | 不负责什么 |
| --- | --- | --- |
| 隔离网络栈和端口 | network namespace | 不自动提供连通性 |
| 连接两个内核网络接口 | veth pair | 不交换多个端口、不选路 |
| 同主机二层交换 | Linux bridge | 不自动跨子网 |
| 在共享交换机中分段 | VLAN | 不自动提供跨 VLAN 路由 |
| 不同子网互通 | route + IP forwarding | 不自动授权流量 |
| 私网 IPv4 共享出口 | SNAT/masquerade | 不替代防火墙 |
| 发布内网服务 | DNAT/端口代理 | 不保证应用正在监听 |
| 状态访问控制 | nftables + conntrack | 不替代应用鉴权 |
| 把包交给用户态程序 | TUN/TAP | 不自动实现 VPN 协议 |
| 跨三层网络扩展逻辑二层 | VXLAN | 需要可达 underlay 与 MTU 规划 |
| 自动配置容器网络 | Docker/CNI | 仍由底层数据平面转发 |

## 2. 综合设计题：三层应用实验网

目标：设计一个本地虚拟网络，包含 Web、API 和 DB 三个安全域。

需求：

- Web 可以被宿主机通过 `127.0.0.1:8080` 访问。
- Web 只能访问 API 的 TCP 8000。
- API 只能访问 DB 的 TCP 5432，并可通过 NAT 出站更新依赖。
- DB 不能主动访问 Web，也不能访问互联网。
- 三个工作负载各自拥有独立 namespace。
- 所有策略具有计数器，可分别抓取每一跳。

一种合理拓扑：

```text
localhost:8080
      │ DNAT
      ▼
web-net 10.66.10.0/24
      │ route + stateful firewall
      ▼
api-net 10.66.20.0/24 ── SNAT ──→ Internet
      │ route + stateful firewall
      ▼
db-net  10.66.30.0/24
```

## 3. 设计时逐层回答

### 隔离层

- 每个工作负载是否独立 namespace？
- 是否需要共享 localhost，例如同一 Pod 内的 sidecar？

### 二层层

- 每个安全域使用独立 bridge/VLAN，还是点对点 veth？
- 广播域需要多大？是否真的需要二层扩展？

### 三层层

- 每个子网的 CIDR 和网关是什么？
- 去程与回程路由是否完整？
- 默认路由是否让 DB 获得了不必要的出站能力？

### NAT 层

- 哪些流需要 SNAT，哪些入口需要 DNAT？
- 是否可以用真实路由代替 NAT，保留端到端地址？

### 策略层

- 哪些方向允许创建新连接？
- 返回流量如何用 conntrack 放行？
- DNS、健康检查和运维通道是否被遗漏？

### 可观测层

- 在哪些接口抓包最能区分故障位置？
- 哪些 nftables 规则需要 counter？
- 地址经过 NAT 后如何关联原始五元组？

## 4. 把设计映射到不同平台

| 本地 Linux 设计 | Docker Compose | Kubernetes | 云 VPC |
| --- | --- | --- | --- |
| namespace | container 网络栈 | Pod 网络栈 | VM/任务的虚拟网卡 |
| bridge/VLAN | 用户自定义 network | CNI 数据平面 | subnet/虚拟交换层 |
| route | daemon/宿主机路由 | 节点/集群路由 | route table |
| nftables | Docker 隔离规则 | NetworkPolicy 实现 | SG/NACL |
| DNAT | `ports` | Service/Ingress/Gateway | LB/公网入口 |
| SNAT | masquerade | egress/NAT 实现 | NAT Gateway |

映射不是一一等价。例如 Kubernetes Service 是稳定虚拟入口，不只是简单 DNAT；云 Security Group 的实现也不一定运行在客户虚拟机内。映射的意义是帮助追踪职责，而不是断言底层实现相同。

## 5. 什么时候不该使用 Overlay

不要因为“容器网络常用 VXLAN”就默认加隧道。先问：

- underlay 能否直接路由工作负载前缀？
- 是否真的需要二层语义跨主机？
- 地址规模和租户隔离是否超过 VLAN/路由能力？
- 团队是否能处理 MTU、VTEP、FDB 与控制平面排错？

原生路由能满足需求时，通常更容易观察；Overlay 的价值是解耦与规模，不是免费获得的复杂度。

## 6. 完成标准

不要用“命令执行过”判断学完。完整掌握应达到：

- 能从任意 namespace 预测 `ip route get` 结果。
- 能解释下一跳 ARP/NDP 查询对象。
- 能区分 bridge FDB、邻居表、路由表和 conntrack 表。
- 能画出 NAT 前后的五元组。
- 能解释 VXLAN 的内外层地址与 MTU预算。
- 能从 Docker/Kubernetes/云对象反推底层职责。
- 能用两到三个抓包点定位数据包消失区间。

## 7. 最终自测

1. 容器访问公网时，从 socket 到真实网卡依次经过哪些对象？
2. 两个 Pod 跨节点通信时，如何判断使用原生路由还是 Overlay？
3. Service 可访问、Pod IP 不可访问是否合理？你会如何拆解？
4. 云安全组显示允许，但连接超时时还应检查哪些层？
5. 如何证明一个问题是 MTU，而不是防火墙？
6. 如果只能选择一个命令开始路由排错，你为什么可能选择 `ip route get`？

完成这些问题后，可以回到[专题首页](./README.md)，按实验顺序闭卷重建拓扑。真正的目标是看到 Docker、Kubernetes 或 VPC 时，不再把它们当成黑盒。

