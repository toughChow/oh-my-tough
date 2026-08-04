# TUN/TAP：把内核数据包交给用户态程序

veth 把数据从一个内核接口直接送到另一个内核接口；TUN/TAP 则在内核网络栈与用户态程序之间建立通道。VPN、虚拟机网络和用户态网络协议栈经常使用它们。

## 1. TUN 与 TAP 的本质区别

| 设备 | 用户态读写内容 | 工作层次 | 常见用途 |
| --- | --- | --- | --- |
| TUN | IP 数据包 | 三层 | 路由型 VPN、用户态 IP 隧道 |
| TAP | 完整以太网帧 | 二层 | 虚拟机网卡、二层 VPN、接入 bridge |

可以用一个问题选择：用户态程序是否需要看到源/目标 MAC 与以太网类型？需要就用 TAP；只处理 IP 就用 TUN。

## 2. 数据为什么会进入用户态

用户态程序打开 `/dev/net/tun`，通过 ioctl 创建或连接设备。随后 Linux 中出现普通网络接口，例如 `tun0`。

```text
Linux 路由表
    │ 选择 tun0
    ▼
内核中的 tun0
    │ 文件描述符 read()
    ▼
VPN 用户态程序
    │ 加密并封装到 UDP/TCP
    ▼
真实网卡 → Internet
```

反方向时，程序从真实 socket 收到密文，解密后把原始 IP 包写入 TUN 文件描述符。内核会把它当作从 `tun0` 收到的数据继续处理。

TAP 的过程相同，但用户态读写的是以太网帧，因此 TAP 可以像物理网卡一样接入 Linux bridge。

## 3. TUN 与 veth 不可互换

```text
veth：内核接口 A  ←→  内核接口 B
TUN： 内核接口    ←→  用户态程序（IP 包）
TAP： 内核接口    ←→  用户态程序（以太网帧）
```

- 容器接入宿主机 bridge 通常使用 veth。
- VPN 需要用户态程序加密、封装，通常使用 TUN。
- 虚拟机进程需要收发虚拟网卡帧，常使用 TAP。

## 4. 路由型 VPN 的完整数据路径

假设系统添加路由 `10.88.0.0/16 dev tun0`：

1. 应用访问 `10.88.1.20`。
2. 内核最长前缀匹配选择 `tun0`。
3. IP 包被交给 VPN 进程。
4. VPN 进程加密原始包，并封装为发往 VPN 对端的外层 UDP 包。
5. 外层包再次经过正常路由，从真实网卡发出。
6. 对端解封装后把内层 IP 包写进自己的 TUN。

这里同时存在两次路由判断：第一次针对内层业务目标，第二次针对外层隧道端点。

```text
外层 IP：本机公网地址 → VPN 对端公网地址
内层 IP：虚拟网地址   → 目标虚拟网地址
```

这也是错误地把 VPN 对端自身路由进隧道会造成递归或断连的原因。

## 5. 观察一个“没有用户态程序”的 TUN

在 `netlab` 中创建 TUN：

```bash
ip tuntap add dev demo-tun mode tun
ip addr add 10.77.0.1/24 dev demo-tun
ip link set demo-tun up

ip -d link show demo-tun
ip route get 10.77.0.2
```

路由表会选择 `demo-tun`，但没有程序读取设备并把包送到另一端，因此 ping 不会成功：

```bash
ping -c 2 -W 1 10.77.0.2
```

这个失败很有意义：虚拟接口只是数据路径的一端，真正的隧道协议、加密和传输逻辑由用户态程序实现。

清理：

```bash
ip link del demo-tun
```

## 6. MTU 为什么在隧道中格外重要

隧道会在原始数据外增加新的 IP、UDP 和协议头。如果底层网络 MTU 是 1500，而内层仍发送接近 1500 字节的包，封装后就可能超过底层 MTU。

常见处理方式：

- 降低 TUN/TAP 接口 MTU。
- 依赖 Path MTU Discovery，并保证 ICMP 不被错误拦截。
- 对 TCP 流量在必要时调整 MSS。

“小包能通，大包或 TLS 卡住”是典型 MTU 症状。

## 7. 性能与安全边界

- 每次进入用户态都会产生额外调度和复制成本；多队列 TUN/TAP 可提升并行度。
- VPN 加密还消耗 CPU，并受密码套件与硬件加速影响。
- 创建或连接设备通常需要 `CAP_NET_ADMIN`，普通文件权限不是唯一边界。
- VPN 建立连通性不等于自动授权所有流量，仍需路由和防火墙策略。

## 自测

1. TUN 与 TAP 分别向用户态交付哪一层数据？
2. 为什么虚拟机更常使用 TAP，而路由型 VPN 更常使用 TUN？
3. 隧道中的内层路由与外层路由分别针对什么目标？
4. 为什么创建并启用一个 TUN 接口后，数据不一定能到达远端？

## 参考资料

- [Linux Kernel：Universal TUN/TAP device driver](https://docs.kernel.org/networking/tuntap.html)

[下一章：VXLAN 与 Overlay 网络 →](./vxlan-overlay.md)

