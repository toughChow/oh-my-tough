# Kubernetes 网络：Pod、CNI、Service 与 NetworkPolicy

Kubernetes 没有规定集群必须使用 bridge、路由还是 VXLAN。它规定网络应呈现怎样的结果，再由 CNI 插件和节点数据平面实现。

## 1. Kubernetes 网络模型

核心期望可以概括为：

- 每个 Pod 拥有集群范围内唯一的 Pod IP。
- 同一 Pod 内的容器共享网络 namespace，可通过 `localhost` 通信。
- 在未被策略隔离时，Pod 可以直接使用 Pod IP 与其他节点上的 Pod 通信，不要求应用自己做 NAT。
- 节点上的系统组件应能与本节点 Pod 通信。

Pod 是 Kubernetes 网络身份的基本单位，不是单个 container。

```text
Pod network namespace
├── app container      ┐
├── sidecar container  ├── 共享 eth0、IP、路由和 localhost
└── sandbox container  ┘
```

因此同一 Pod 的两个容器不能同时监听相同 IP/端口。

## 2. CNI 是接口规范，不是一种数据平面

CNI（Container Network Interface）定义容器运行时如何调用网络插件。运行时提供容器网络空间和配置，插件完成接口、地址和路由等工作。

常见操作：

- `ADD`：把容器加入网络。
- `DEL`：删除网络配置并释放资源。
- `CHECK`：检查现有配置是否符合预期。
- `VERSION`：协商支持的规范版本。

CNI 插件可能：

- 创建 veth 并接入 bridge。
- 为 Pod 分配 IP（IPAM）。
- 添加主机路由或隧道设备。
- 编程 eBPF、nftables 或其他数据平面。
- 实现 NetworkPolicy。

所以“集群用了 CNI”并没有说明数据包到底怎么走，必须继续确认具体插件和配置模式。

## 3. 同节点与跨节点 Pod 通信

### 同节点

典型实现可能是：

```text
Pod A netns ─ veth ─ bridge/host routing ─ veth ─ Pod B netns
```

### 跨节点

常见两类：

**原生路由：** 每个节点宣告自己的 Pod CIDR，底层网络直接把 Pod IP 路由到对应节点。

```text
Pod A → Node A route → underlay router → Node B route → Pod B
```

**Overlay：** 节点把 Pod 数据包封装进 VXLAN 等隧道，底层只需要路由节点 IP。

```text
Pod A → VTEP A → UDP/VXLAN underlay → VTEP B → Pod B
```

原生路由通常头部开销更小，但需要底层网络接受 Pod 路由；Overlay 解耦更强，但增加封装、MTU 和排错复杂度。

## 4. Service IP 为什么不是普通网卡地址

Pod 会重建、IP 会变化。Service 提供稳定的虚拟 IP 和端口，并把请求分发给匹配的后端 EndpointSlice。

```text
client Pod
→ Service ClusterIP:port
→ 节点上的服务转发规则
→ 某个 PodIP:targetPort
```

ClusterIP 通常不是绑定在某块普通接口上的地址。kube-proxy 或替代数据平面观察 Service/EndpointSlice，并安装转发规则。实现可能使用 iptables、IPVS、nftables，或由网络插件使用 eBPF 等机制替代。

Service 解决的是四层稳定入口与后端选择，不等于七层 HTTP 路由。

## 5. DNS 与服务发现

集群 DNS 通常为 Service 提供名称，例如：

```text
api.default.svc.cluster.local
```

普通 Service 名解析到 ClusterIP；headless Service 不分配 ClusterIP，DNS 可直接返回后端 Pod 地址。

排查服务名失败时，应拆成：

1. DNS 查询是否得到预期记录。
2. Service selector 是否选中正确 Pod。
3. EndpointSlice 是否包含 ready 地址与正确端口。
4. ClusterIP 数据平面是否正确转发。
5. NetworkPolicy 是否放行 DNS 与业务流量。

## 6. NetworkPolicy 的真实语义

NetworkPolicy 是声明式 L3/L4 访问控制 API，是否生效取决于网络实现是否支持。

几个关键规则：

- 策略按 namespace 内的 Pod selector 选择 Pod。
- 一个方向开始被策略选择后，该方向进入隔离状态。
- 多条策略的允许结果是相加的，不按“第一条匹配”覆盖。
- 一条连接要成功，源 Pod 的 egress 和目标 Pod 的 ingress 都必须允许。
- NetworkPolicy 通常控制 IP/端口，不替代应用身份和七层授权。

```text
source Pod egress 允许
             AND
destination Pod ingress 允许
             ↓
         连接才允许
```

默认拒绝策略落地后，别忘记显式允许 DNS、监控、健康检查和必要的控制面通信。

## 7. Ingress、Gateway 与 Service 的边界

| 对象 | 主要层次 | 作用 |
| --- | --- | --- |
| Pod network | L3 | Pod 到 Pod 连通 |
| Service | L4 | 稳定虚拟 IP、端口和后端选择 |
| Ingress | L7 HTTP/HTTPS | 按域名、路径把外部请求路由到 Service |
| Gateway API | 多角色、可扩展 | 更丰富的网关和流量路由模型 |
| NetworkPolicy | L3/L4 | Pod 级流量允许策略 |

创建 Ingress 或 Gateway API 对象本身不一定产生数据平面，集群还需要对应 controller 实现。

## 8. 可选实验：观察 Pod、Service 与 DNS

在已经可用的测试 Kubernetes 集群中执行：

```bash
kubectl create deployment vnet-web --image=nginx:alpine --replicas=2
kubectl expose deployment vnet-web --port=80
kubectl run vnet-client --image=busybox:1.36 --restart=Never -- sleep 1d
kubectl wait --for=condition=Ready pod/vnet-client --timeout=90s
```

观察控制面对象：

```bash
kubectl get pod -o wide
kubectl get service vnet-web
kubectl get endpointslice -l kubernetes.io/service-name=vnet-web
```

从客户端验证 DNS 和 Service：

```bash
kubectl exec vnet-client -- nslookup vnet-web
kubectl exec vnet-client -- wget -qO- http://vnet-web
```

记录 Service ClusterIP、两个 Pod IP 和 EndpointSlice，再思考请求地址在哪一步被改成某个 Pod IP。

清理：

```bash
kubectl delete pod vnet-client
kubectl delete service vnet-web
kubectl delete deployment vnet-web
```

## 9. Kubernetes 网络排错顺序

1. `kubectl get pod -o wide`：Pod IP、节点、Ready 状态。
2. 进入 Pod 检查地址、路由和 DNS。
3. 用 Pod IP 直连，区分 Pod 网络与 Service 问题。
4. 检查 Service selector、port/targetPort 和 EndpointSlice。
5. 检查 NetworkPolicy 的 ingress 与 egress 两侧。
6. 到节点检查 CNI 接口、路由、隧道、MTU 与服务转发规则。
7. 分别在源 Pod、源节点、目标节点和目标 Pod 抓包。

## 自测

1. 为什么 Kubernetes 网络身份属于 Pod 而不是单个容器？
2. CNI 规范与具体 CNI 数据平面的区别是什么？
3. ClusterIP 为什么不一定出现在 `ip addr` 中？
4. 一条 NetworkPolicy 允许目标 ingress，为什么连接仍可能失败？

## 参考资料

- [Kubernetes：Services, Load Balancing, and Networking](https://kubernetes.io/docs/concepts/services-networking/)
- [Kubernetes：Virtual IPs and Service Proxies](https://kubernetes.io/docs/reference/networking/virtual-ips/)
- [Kubernetes：Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [CNI Specification](https://www.cni.dev/docs/spec/)

[下一章：云 VPC 的虚拟网络模型 →](./cloud-vpc.md)
