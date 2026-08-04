# 用 OrbStack 搭建虚拟网络实验环境

OrbStack 可以在 macOS 上运行 Docker 容器和完整的 Linux 机器。本教程使用独立的 Ubuntu 机器 `netlab`，这样可以放心创建和删除虚拟网卡、路由与 namespace，不影响 Mac 的实际网络。

> 本页命令以 macOS 终端为起点。带有 `Mac $` 的命令在 Mac 执行，带有 `Linux #` 的命令在 Ubuntu 实验机内执行。

## 1. 安装 OrbStack

任选一种方式：

```bash
# Homebrew
brew install orbstack
```

或者从 [OrbStack 官网](https://orbstack.dev/download)下载安装。首次安装后打开一次 OrbStack，完成系统授权。

确认命令可用：

```bash
orb version
orb status
```

::: info 为什么不用 macOS 直接做？
`network namespace`、veth、Linux bridge 和 `iproute2` 都是 Linux 内核能力。Docker 容器也能勉强承载实验，但需要较高权限，且容易把“容器自己的网络”与“正在学习的网络”混在一起。独立 Linux 机器更直观。
:::

## 2. 创建专用 Ubuntu 机器

```bash
orb create ubuntu netlab
orb list
```

如果 `netlab` 已经存在，不要重复创建，直接进入即可：

```bash
orb -m netlab -u root
```

`-m netlab` 指定机器，`-u root` 以 root 用户进入。网络实验需要创建网卡和修改路由，因此需要管理员权限。

## 3. 安装实验工具

进入 Linux 后执行：

```bash
apt update
apt install -y iproute2 iputils-ping tcpdump nftables conntrack
```

确认环境：

```bash
ip -V
nft --version
conntrack -V
ip netns list
uname -a
```

没有报错就可以开始实验。此时输入 `exit` 可以回到 Mac。

## 4. 日常使用速查

以下命令都在 Mac 终端执行：

| 目的 | 命令 |
| --- | --- |
| 查看所有机器 | `orb list` |
| 进入实验机 | `orb -m netlab -u root` |
| 在实验机直接执行一条命令 | `orb -m netlab -u root ip netns list` |
| 启动实验机 | `orb start netlab` |
| 停止实验机 | `orb stop netlab` |
| 查看启动日志 | `orb logs netlab` |

停止机器不会删除实验数据，下次启动可以继续使用。

## 5. Apple Silicon 说明

Apple Silicon Mac 默认会创建 ARM64 Ubuntu，这正适合本教程。`iproute2`、ping 和 tcpdump 都提供 ARM64 版本，不需要为了网络实验创建 AMD64 机器。

只有明确需要运行仅支持 x86_64 的软件时，才考虑：

```bash
orb create --arch amd64 ubuntu netlab-amd64
```

## 6. 常见问题

### `orb: command not found`

先确认 OrbStack 应用已经启动。Homebrew 安装后仍找不到命令时，重新打开终端，再运行 `orb version`。

### `machine already exists`

说明 `netlab` 已创建，直接执行：

```bash
orb -m netlab -u root
```

### `ip: command not found`

进入实验机后安装 `iproute2`：

```bash
apt update && apt install -y iproute2
```

### 实验做到一半状态混乱

优先使用每课末尾的清理命令，不需要删除整台机器。要检查残留对象，可以运行：

```bash
ip netns list
ip -br link
```

::: danger 不要随手执行 reset
`orb reset` 会删除 OrbStack 管理的 Linux 和 Docker 数据，不是普通的“重启”。本教程不需要这个命令。
:::

## 参考资料

- [OrbStack Quick start](https://docs.orbstack.dev/quick-start)
- [OrbStack Linux machines](https://docs.orbstack.dev/machines/)
- [OrbStack commands](https://docs.orbstack.dev/machines/commands)

[下一步：实验 1，搭建同一子网 →](./lab-01-bridge.md)
