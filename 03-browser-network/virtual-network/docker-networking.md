# Docker 网络：把 namespace、veth、bridge 和 NAT 串起来

从容器内部看，网络很普通：一块网卡、一个 IP、一个默认网关、一份 DNS 配置。Docker 的工作是替你创建这些对象，并把容器接入合适的数据路径。

## 1. bridge 模式的数据路径

Linux 上典型的 Docker bridge 网络：

```text
容器进程
  │ socket
  ▼
容器 network namespace
  │ eth0
  ▼
veth pair
  ▼
宿主机 Linux bridge
  ├── 其他同网络容器
  └── 宿主机路由 + masquerade ──→ 外部网络
```

这正是前面实验过的对象组合：

- namespace 隔离容器网络栈。
- veth 把容器接入宿主机。
- bridge 提供同主机二层通信。
- 路由和 NAT 提供外部访问。
- nftables/iptables 实现隔离与端口发布。

## 2. Docker 内置网络驱动

| 驱动 | 行为 | 适用场景 |
| --- | --- | --- |
| bridge | 容器拥有独立网络栈，接入单机软件 bridge | 默认单机容器网络 |
| host | 与宿主机共享网络 namespace | 低额外开销、需要大量端口 |
| none | 只保留最小网络环境，不自动接入外部 | 完全自定义或强隔离 |
| overlay | 跨 Docker 主机的逻辑网络 | Docker Swarm 多节点网络 |
| macvlan | 容器在外部二层网络中表现为独立 MAC | 接入传统二层设备 |
| ipvlan | 多个容器共享主接口的二层特征，按 IP 分流 | 外部交换机限制 MAC 数量等场景 |

`host` 模式下容器没有独立容器 IP，端口发布参数通常没有意义；端口冲突也直接发生在宿主机网络空间。

### macvlan 与 ipvlan 怎么选

- `macvlan` 为子接口提供不同 MAC，容器更像直接接在外部交换机上的独立设备；但上游端口需要接受多个 MAC，宿主机与 macvlan 子接口之间的直连也有特殊限制。
- `ipvlan` 让子接口共享主接口的二层特征，以 IP 做复用/分流，适合上游限制每端口 MAC 数量的环境。

两者都更接近外部网络，不等于自动拥有更好的隔离。选择前要确认上游交换机、地址管理、宿主机通信和安全策略。

## 3. 默认 bridge 与用户自定义 bridge

Docker 启动时通常创建名为 `bridge` 的默认网络。生产和学习更推荐创建用户自定义 bridge：

- 可明确规划子网。
- 同一网络中的容器可通过容器名解析。
- 不同用户自定义网络之间默认隔离。
- 生命周期与应用更容易一起管理。

“容器能通过名字访问另一个容器”通常依赖 Docker 内置 DNS，不是 bridge 自己提供 DNS。

## 4. 容器出站为什么能访问互联网

典型路径：

1. 容器路由表把非本地目标交给 bridge 网关。
2. 宿主机开启转发。
3. Docker 安装 NAT 规则，对容器源地址做 masquerade。
4. 外部只看到宿主机出口地址。
5. conntrack 把响应还原并送回容器。

如果容器能访问 IP 但不能解析域名，优先检查 DNS，而不是重复修改 NAT。

## 5. `-p 8080:80` 到底做了什么

端口发布表达的是：访问宿主机某地址的 TCP 8080，转发到容器的 TCP 80。

```text
客户端
→ 宿主机IP:8080
→ DNAT / 端口转发规则
→ 容器IP:80
→ conntrack 维护响应方向
```

注意两个边界：

- 容器中的服务必须监听容器接口，而不是只监听 `127.0.0.1`。
- 未指定宿主机绑定地址时，发布端口可能监听所有宿主机地址；安全策略应明确暴露范围。

`EXPOSE 80` 主要是镜像元数据，不等于已经把端口发布到宿主机。

## 6. 实验 7：观察一个用户自定义 bridge

以下命令在 Mac 终端执行。OrbStack 的 Docker daemon 运行在其 Linux 环境中，因此不要期待在 macOS 或独立的 `netlab` 机器里直接看到 daemon 的 `docker0`。

创建网络与两个容器：

```bash
docker network create --driver bridge --subnet 172.28.0.0/24 vnet-demo

docker run -d --name vnet-a --network vnet-demo busybox:1.36 sleep 1d
docker run -d --name vnet-b --network vnet-demo busybox:1.36 sleep 1d
```

从容器视角检查：

```bash
docker exec vnet-a ip addr
docker exec vnet-a ip route
docker exec vnet-a cat /etc/resolv.conf
docker exec vnet-a ping -c 2 vnet-b
```

从 Docker 控制面检查网络：

```bash
docker network inspect vnet-demo
docker inspect vnet-a
```

启动服务并用容器名访问：

```bash
docker run -d --name vnet-web --network vnet-demo nginx:alpine
docker exec vnet-a wget -qO- http://vnet-web
```

再启动一个发布到 Mac 8080 端口的服务：

```bash
docker run -d --name vnet-pub --network vnet-demo -p 127.0.0.1:8080:80 nginx:alpine
curl http://127.0.0.1:8080
```

这里显式绑定 `127.0.0.1`，避免服务意外暴露给局域网。

## 7. Compose 网络

Docker Compose 默认会为项目创建用户自定义网络，服务可通过 service 名互相解析：

```text
frontend → http://api:8080
api      → postgres://db:5432
```

容器 IP 可能随重建变化，应用应依赖稳定名称与服务发现，不要把临时容器 IP 写死。

可以为前端与数据层创建不同网络，让只有 API 同时连接两者：

```text
public-net: frontend, api
data-net:   api, db
```

这属于网络分段，但仍应配合应用鉴权、密钥管理和主机防火墙。

## 8. 常见问题定位

| 现象 | 优先检查 |
| --- | --- |
| 容器没有地址 | `docker network inspect`、daemon/CNI 错误 |
| 同网络 IP 能通、名字不通 | 容器 DNS 与网络归属 |
| 容器能出站，外部不能访问 | 是否发布端口、绑定地址、服务监听地址 |
| Mac 看不到 `docker0` | Docker daemon 在 Linux VM 中，这是正常现象 |
| 两个自定义网络不互通 | 这是默认隔离；使用多网卡容器或明确路由/代理 |

## 9. 清理

```bash
docker rm -f vnet-a vnet-b vnet-web vnet-pub
docker network rm vnet-demo
```

## 自测

1. Docker bridge 模式分别使用了哪些 Linux 内核对象？
2. 用户自定义 bridge 为什么比默认 bridge 更适合应用？
3. `EXPOSE` 与 `-p` 的区别是什么？
4. host 网络模式为什么容易产生端口冲突？

## 参考资料

- [Docker：Networking overview](https://docs.docker.com/engine/network/)
- [Docker：Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)
- [Docker：Host network driver](https://docs.docker.com/engine/network/drivers/host/)

[下一章：Kubernetes、CNI 与 Service →](./kubernetes-networking.md)
