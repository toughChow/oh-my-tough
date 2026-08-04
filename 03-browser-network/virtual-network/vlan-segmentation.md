# VLAN：在同一交换网络中划分广播域

bridge 能连接多个二层端口，但并不代表所有端口都应该处于同一个广播域。VLAN 使用以太网帧中的 802.1Q 标签，在共享的交换基础设施上划分相互隔离的二层网络。

## 1. VLAN 解决什么问题

没有 VLAN 时，一个大型二层网络会面临：

- ARP、未知单播等广播域流量扩大。
- 不同业务或租户默认可以在二层直接接触。
- 网络迁移受物理交换机端口限制。

VLAN 把一台物理或虚拟交换机逻辑上切成多台交换机：

```text
同一个 bridge / switch
├── VLAN 10：frontend-a、frontend-b
└── VLAN 20：database-a、database-b
```

VLAN 10 与 VLAN 20 默认不能二层互通。跨 VLAN 通信需要三层路由，并可在路由点实施安全策略。

## 2. Access 端口与 Trunk 端口

### Access 端口

连接普通主机，主机收发的帧通常不带 VLAN 标签。交换机在帧进入端口时归入该端口的 PVID，离开时移除标签。

### Trunk 端口

在交换机、路由器或虚拟化宿主机之间承载多个 VLAN。帧保留标签，对端根据 VLAN ID 再次分类。

```text
host A ─ access VLAN 10 ┐
                        switch ─ trunk VLAN 10,20 ─ switch
host B ─ access VLAN 20 ┘
```

`tagged/untagged` 描述帧在线路上是否携带标签；`PVID` 描述无标签入站帧应该被归入哪个 VLAN。它们相关但不是同一个概念。

## 3. bridge 开启 VLAN filtering 后如何转发

普通 bridge 的 FDB 主要学习 `MAC → 端口`。开启 VLAN filtering 后，转发维度变成：

```text
(VLAN ID, MAC) → 端口
```

同一个 MAC 地址甚至可以在不同 VLAN 中拥有独立学习结果。广播和未知单播也只会在同一 VLAN 的成员端口之间泛洪。

## 4. 实验 4：同一个 bridge 上的两个隔离 VLAN

拓扑：

```text
v10-a 10.50.0.1 ─ access VLAN 10 ┐
v10-b 10.50.0.2 ─ access VLAN 10 ├─ vlan-br0
v20-a 10.50.0.3 ─ access VLAN 20 ┘
```

三个主机故意配置在同一个 IP 子网，以证明二层 VLAN 隔离发生在 IP 路由之前。

进入 `netlab` root shell，创建对象：

```bash
ip netns add v10-a
ip netns add v10-b
ip netns add v20-a

ip link add h10a type veth peer name p10a
ip link add h10b type veth peer name p10b
ip link add h20a type veth peer name p20a

ip link set h10a netns v10-a
ip link set h10b netns v10-b
ip link set h20a netns v20-a

ip link add vlan-br0 type bridge vlan_filtering 1
ip link set vlan-br0 up
```

把宿主机端接入 bridge：

```bash
ip link set p10a master vlan-br0
ip link set p10b master vlan-br0
ip link set p20a master vlan-br0
ip link set p10a up
ip link set p10b up
ip link set p20a up
```

删除默认 VLAN 1，并配置 access VLAN：

```bash
bridge vlan del dev p10a vid 1
bridge vlan del dev p10b vid 1
bridge vlan del dev p20a vid 1

bridge vlan add dev p10a vid 10 pvid untagged
bridge vlan add dev p10b vid 10 pvid untagged
bridge vlan add dev p20a vid 20 pvid untagged

bridge vlan show
```

配置主机：

```bash
ip netns exec v10-a ip link set lo up
ip netns exec v10-a ip link set h10a up
ip netns exec v10-a ip addr add 10.50.0.1/24 dev h10a

ip netns exec v10-b ip link set lo up
ip netns exec v10-b ip link set h10b up
ip netns exec v10-b ip addr add 10.50.0.2/24 dev h10b

ip netns exec v20-a ip link set lo up
ip netns exec v20-a ip link set h20a up
ip netns exec v20-a ip addr add 10.50.0.3/24 dev h20a
```

同 VLAN 通信成功：

```bash
ip netns exec v10-a ping -c 2 10.50.0.2
```

不同 VLAN 即使 IP 看起来在同一子网也失败：

```bash
ip netns exec v10-a ping -c 2 -W 1 10.50.0.3
```

原因是 `v10-a` 会直接 ARP 查询 `10.50.0.3`，但这个广播不会被转发到 VLAN 20。仅添加默认网关也无法修复错误的地址规划；不同 VLAN 应使用不同 IP 子网，再由路由器连接。

查看按 VLAN 学习的 FDB：

```bash
bridge fdb show br vlan-br0
```

## 5. 跨 VLAN 路由

常见方式有：

- 路由器为每个 VLAN 使用独立物理/虚拟接口。
- trunk 连接路由器，在一个接口上创建 `eth0.10`、`eth0.20` 子接口，俗称 router-on-a-stick。
- 三层交换机使用 SVI，为每个 VLAN 提供网关接口。

无论实现方式如何，每个 VLAN 通常对应一个不同 IP 前缀。路由点是实施防火墙与访问控制的自然位置。

## 6. VLAN 不是完整安全边界

VLAN 能隔离正常二层转发，但安全还依赖：

- trunk 允许的 VLAN 列表是否最小化。
- native/PVID 配置是否在两端一致。
- 跨 VLAN 路由策略是否默认拒绝。
- 虚拟交换机与宿主机权限是否受控。

把 VLAN 当作分段工具，而不是独立完成身份鉴别和应用授权的安全产品。

## 7. 二层环路与 STP

如果两个交换节点之间存在多条未受控二层路径，广播帧可能不断循环，引发广播风暴和 MAC 地址表抖动。以太网帧没有类似 IP TTL 的字段，不能依赖“转几次后自动消失”。

STP/RSTP 通过计算无环拓扑阻塞冗余端口，并在链路故障时重新收敛。Linux bridge 支持 STP，但默认是否开启取决于创建和管理方式。容器网络通常避免任意二层环路，或由明确的控制平面管理冗余路径。

## 8. 清理

```bash
ip netns del v10-a
ip netns del v10-b
ip netns del v20-a
ip link del vlan-br0
```

## 自测

1. Access 与 trunk 端口的帧标签有什么区别？
2. PVID 的作用是什么？
3. 为什么同一 IP 子网的两个主机仍可能因 VLAN 不同而无法通信？
4. 开启 VLAN filtering 后，FDB 为什么需要同时考虑 VLAN ID？
5. 为什么二层环路比三层路由环路更容易形成持续广播风暴？

## 参考资料

- [Linux Kernel：Ethernet Bridging](https://docs.kernel.org/networking/bridge.html)

[下一章：TUN/TAP 与用户态网络 →](./tuntap-vpn.md)
