# 实验 1：namespace、veth 与 Linux bridge

## 本课目标

用一个 Linux 内核模拟两台主机和一台二层交换机，并观察 ARP 与 MAC 地址学习。

```text
namespace: lab-ns1                    namespace: lab-ns2
10.10.0.1/24                          10.10.0.2/24
     ns1eth                                ns2eth
       │                                     │
     veth1                                 veth2
       └──────── bridge: lab-br0 ────────────┘
```

开始前，从 Mac 进入实验机：

```bash
orb -m netlab -u root
```

后续命令都在这个 root shell 中执行。

## 1. 创建两个独立网络空间

```bash
ip netns add lab-ns1
ip netns add lab-ns2
ip netns list
```

查看其中一个 namespace：

```bash
ip netns exec lab-ns1 ip -br addr
ip netns exec lab-ns1 ip route
```

此时它只有一块未启用的回环网卡，没有 IP，也没有通往外部的路由。

## 2. 创建虚拟交换机

```bash
ip link add lab-br0 type bridge
ip link set lab-br0 up
```

bridge 工作在二层，会根据 MAC 地址表决定从哪个端口转发以太网帧。这个实验不要求给 bridge 配 IP，因为交换机自身不参与三层通信。

## 3. 创建两对 veth

```bash
ip link add veth1 type veth peer name ns1eth
ip link add veth2 type veth peer name ns2eth
```

veth 总是成对创建。一端收到的数据会立刻从另一端出现，可以把它想成一根虚拟网线：

```text
veth1 <================> ns1eth
veth2 <================> ns2eth
```

把每根网线的一端放入对应 namespace：

```bash
ip link set ns1eth netns lab-ns1
ip link set ns2eth netns lab-ns2
```

把留在当前空间的两端接入 bridge，并启用：

```bash
ip link set veth1 master lab-br0
ip link set veth2 master lab-br0
ip link set veth1 up
ip link set veth2 up
```

验证 bridge 端口：

```bash
bridge link
```

## 4. 配置两台虚拟主机

配置第一台主机：

```bash
ip netns exec lab-ns1 ip link set lo up
ip netns exec lab-ns1 ip link set ns1eth up
ip netns exec lab-ns1 ip addr add 10.10.0.1/24 dev ns1eth
```

配置第二台主机：

```bash
ip netns exec lab-ns2 ip link set lo up
ip netns exec lab-ns2 ip link set ns2eth up
ip netns exec lab-ns2 ip addr add 10.10.0.2/24 dev ns2eth
```

检查地址和自动生成的直连路由：

```bash
ip netns exec lab-ns1 ip -br addr
ip netns exec lab-ns1 ip route
ip netns exec lab-ns2 ip -br addr
ip netns exec lab-ns2 ip route
```

两台主机都拥有 `10.10.0.0/24` 的直连路由，因此不需要默认网关。

## 5. 第一次 ping 发生了什么

```bash
ip netns exec lab-ns1 ping -c 3 10.10.0.2
```

第一次通信需要先解决“知道 IP，但不知道目标 MAC”的问题：

1. `lab-ns1` 根据 `/24` 掩码判断目标在同一子网。
2. `lab-ns1` 广播 ARP 请求：“谁是 `10.10.0.2`？”
3. bridge 将广播泛洪到其他端口。
4. `lab-ns2` 单播回复自己的 MAC 地址。
5. 双方开始传递 ICMP Echo Request 和 Reply。

查看 ARP/邻居表：

```bash
ip netns exec lab-ns1 ip neigh
ip netns exec lab-ns2 ip neigh
```

查看 bridge 学到的 MAC 地址：

```bash
bridge fdb show br lab-br0
```

## 6. 用抓包证明推理

先清空 `lab-ns1` 的邻居缓存：

```bash
ip netns exec lab-ns1 ip neigh flush all
```

在第一个 Linux 终端抓包：

```bash
ip netns exec lab-ns1 tcpdump -n -e -i ns1eth 'arp or icmp'
```

再打开一个 Mac 终端，直接触发一次 ping：

```bash
orb -m netlab -u root ip netns exec lab-ns2 ping -c 1 10.10.0.1
```

你会先看到 ARP，再看到 ICMP。回到抓包终端按 `Ctrl+C` 停止。

## 7. 故意制造故障

关闭 bridge 的一个端口：

```bash
ip link set veth2 down
ip netns exec lab-ns1 ping -c 2 -W 1 10.10.0.2
```

恢复端口后再次验证：

```bash
ip link set veth2 up
ip netns exec lab-ns1 ping -c 2 10.10.0.2
```

这说明“namespace 中的网卡是 UP”还不够，整条链路上的每个端口都必须工作。

## 8. 清理实验

```bash
ip netns del lab-ns1
ip netns del lab-ns2
ip link del lab-br0
```

namespace 被删除时，其中的 veth 端点消失，另一端也会随之删除。检查是否清理干净：

```bash
ip netns list
ip link show lab-br0
```

最后一条命令显示 `Device "lab-br0" does not exist` 正是预期结果。

## 本课自测

1. 为什么 bridge 不配置 IP 也能转发？
2. 为什么两台主机不需要默认网关？
3. ARP 请求是广播还是单播？ARP 响应呢？
4. `ip neigh` 和 `bridge fdb` 分别记录 IP→MAC 还是 MAC→端口？

[下一课：用 Linux 路由器连接两个子网 →](./lab-02-router.md)

