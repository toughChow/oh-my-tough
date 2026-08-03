# JavaScript 执行上下文

> 状态：学习中 ｜ 建议用时：60～90 分钟 ｜ 前置知识：无

## 学习目标

学完这一篇，你应该能够：

- 用 1～2 分钟解释什么是执行上下文。
- 画出一段同步代码的调用栈变化。
- 区分执行上下文、作用域和调用栈。
- 解释变量提升、暂时性死区和函数调用为什么与执行上下文有关。
- 应对至少三层面试追问。

## 一句话面试回答

执行上下文是 JavaScript 规范用来描述“当前代码如何被执行”的抽象运行环境。它记录代码执行状态、当前函数或脚本、词法环境、变量环境以及 `this` 等信息。

JavaScript 执行全局代码或调用函数时，会创建或切换相应的执行上下文；活动上下文由调用栈管理，栈顶就是当前正在运行的上下文。函数返回后，其上下文通常出栈，但被闭包引用的词法环境仍然可以存活。

## 先建立整体模型

可以先把 JavaScript 同步执行过程理解成三个角色：

```text
源代码
  │
  ▼
执行上下文：保存“这一段代码执行所需的信息”
  │
  ▼
调用栈：按照后进先出顺序管理活动的执行上下文
```

注意：执行上下文是 ECMAScript 规范中的抽象机制。具体引擎可能采用不同的数据结构和优化方式，不应该把它机械地等同于某块真实内存。

## 执行上下文包含什么

面试层面可以重点记住以下信息：

| 信息 | 作用 |
| --- | --- |
| 代码执行状态 | 记录执行位置，以及暂停和恢复所需的信息 |
| Function | 当前上下文关联的函数；脚本或模块上下文中为空 |
| Realm | 当前代码所属的全局环境及内建对象集合 |
| ScriptOrModule | 当前代码来源于哪个脚本或模块 |
| LexicalEnvironment | 解析 `let`、`const`、`class` 等标识符绑定 |
| VariableEnvironment | 保存由 `var` 等声明建立的绑定 |
| PrivateEnvironment | 解析类中的私有名称，如 `#name` |

`this` 的解析也依赖当前环境记录。面试中常见的“变量对象、活动对象、作用域链”多来自旧版规范或教学模型，可以帮助理解，但不要说成现代规范的准确字段名称。

## 三类常见执行上下文

### 全局执行上下文

脚本开始运行时建立全局层面的执行环境。浏览器页面通常以 `window` 作为全局对象，但顶层声明是否成为 `window` 属性还取决于声明方式和脚本类型。

```js
var legacy = 1
let modern = 2

console.log(window.legacy) // 普通经典脚本中通常为 1
console.log(window.modern) // undefined
```

### 函数执行上下文

每次调用函数都会创建一个新的函数执行上下文。同一个函数调用两次，对应两个不同的调用实例和局部绑定。

```js
function add(a, b) {
  const result = a + b
  return result
}

add(1, 2)
add(10, 20)
```

两次 `add` 调用的参数和 `result` 互不影响。

### `eval` 执行上下文

直接调用 `eval` 会引入特殊的执行语义，也会妨碍静态分析和引擎优化。实际项目应尽量避免使用；面试知道它属于特殊情况即可。

## 调用栈如何工作

观察下面的代码：

```js
function multiply(a, b) {
  return a * b
}

function square(n) {
  return multiply(n, n)
}

const result = square(3)
console.log(result)
```

执行过程可以画成：

```text
1. 开始执行脚本

┌──────────────────┐
│ 全局执行上下文     │ ← 栈顶
└──────────────────┘

2. 调用 square(3)

┌──────────────────┐
│ square 执行上下文  │ ← 栈顶
├──────────────────┤
│ 全局执行上下文     │
└──────────────────┘

3. square 调用 multiply(3, 3)

┌──────────────────┐
│ multiply 执行上下文│ ← 栈顶
├──────────────────┤
│ square 执行上下文  │
├──────────────────┤
│ 全局执行上下文     │
└──────────────────┘

4. multiply 返回，随后 square 返回

┌──────────────────┐
│ 全局执行上下文     │ ← 栈顶
└──────────────────┘
```

调用栈采用后进先出（LIFO）：最后进入的函数最先返回。无限递归持续压栈，最终会超过栈容量：

```js
function recurse() {
  recurse()
}

recurse() // RangeError: Maximum call stack size exceeded
```

## 创建阶段和执行阶段怎么理解

很多面试资料会把执行上下文概括为两个阶段：

1. 创建阶段：建立各种标识符绑定并确定外部环境等信息。
2. 执行阶段：按照语句顺序求值、读取和修改绑定。

这个模型适合解释“为什么声明看起来会提升”，但它是教学概括。更准确的说法是：在真正求值语句之前，规范中的声明实例化算法会先创建相应绑定。

### `var` 的表现

```js
console.log(count) // undefined
var count = 10
```

可以近似理解为：`count` 的绑定先被创建并初始化为 `undefined`，执行到赋值语句时才变为 `10`。

### 函数声明的表现

```js
sayHello() // hello

function sayHello() {
  console.log('hello')
}
```

函数声明的绑定会在执行函数调用之前完成初始化，因此可以在声明文本之前调用。

### `let` 和 `const` 的表现

```js
console.log(user) // ReferenceError
let user = 'Ada'
```

`user` 的绑定已经存在，但在执行到声明之前尚未初始化。这段区域称为暂时性死区（TDZ），因此不能简单说“`let` 不提升”。更准确的回答是：绑定会被创建，但在声明求值前不可访问。

## 词法环境和作用域链

词法环境可以理解为：

```text
Lexical Environment
├── Environment Record：当前环境中的标识符绑定
└── Outer：指向外层词法环境
```

查找变量时，会从当前词法环境开始；当前环境找不到，就沿着 `Outer` 继续向外，直到找到绑定或到达最外层。

```js
const globalName = 'global'

function outer() {
  const outerName = 'outer'

  function inner() {
    const innerName = 'inner'
    console.log(innerName, outerName, globalName)
  }

  inner()
}

outer()
```

`inner` 中的标识符查找大致为：

```text
inner 词法环境
   ↓ Outer
outer 词法环境
   ↓ Outer
全局词法环境
   ↓ Outer
null
```

这个外层关系由函数在代码中的定义位置决定，而不是调用位置决定，因此 JavaScript 使用的是词法作用域。

## 执行上下文、作用域和调用栈的区别

这是本篇最容易混淆的部分。

| 概念 | 核心问题 | 特点 |
| --- | --- | --- |
| 作用域 | 某个标识符在代码的哪些位置可见？ | 主要由代码书写位置决定 |
| 执行上下文 | 当前代码执行需要记录哪些状态？ | 运行时产生或切换 |
| 词法环境 | 标识符绑定存在哪里，外层环境是谁？ | 是上下文解析变量的重要组成 |
| 调用栈 | 当前有哪些活动执行上下文？ | 后进先出管理同步调用 |

同一个函数只有一套词法作用域规则，但每次调用都会产生新的执行上下文：

```js
function createUser(name) {
  const id = Math.random()
  return { id, name }
}

const a = createUser('A')
const b = createUser('B')
```

两次调用共享相同的代码和词法结构，但拥有各自独立的 `name`、`id` 绑定。

## 与闭包的关系

函数创建时会关联其定义位置的外部词法环境。即使外层函数已经返回，只要内部函数仍引用那些绑定，相应环境就不能被回收。

```js
function createCounter() {
  let count = 0

  return function increment() {
    count += 1
    return count
  }
}

const counter = createCounter()

console.log(counter()) // 1
console.log(counter()) // 2
```

`createCounter` 的执行上下文已经出栈，但 `count` 所在的词法环境仍被 `increment` 引用。要注意：闭包保留的是变量绑定，不是创建时数值的静态副本。

## 高频面试追问

### 追问一：执行上下文等同于作用域吗？

不等同。作用域描述标识符在源代码中的可见范围，主要由词法结构决定；执行上下文描述代码运行时的状态。一个函数的作用域结构相对固定，但每次调用都会建立新的函数执行上下文。

### 追问二：执行上下文等同于调用栈中的栈帧吗？

日常交流中可以近似理解，但严谨来说，执行上下文是规范机制，栈帧是实现或运行时层面的常用说法。规范也存在生成器、异步函数等暂停和恢复上下文的情况，不能把所有上下文切换都简化为普通函数栈帧。

### 追问三：函数返回后，它的局部变量一定被销毁吗？

不一定。函数执行上下文通常会退出调用栈，但如果局部绑定仍被闭包引用，对应的词法环境就必须继续存活。什么时候释放还取决于后续是否仍可达以及垃圾回收器的判断。

### 追问四：为什么 `let` 也算提升？

因为进入相应作用域时，它的绑定已经被创建；只是初始化发生在声明语句求值时。在创建和初始化之间访问该绑定会触发 `ReferenceError`，这段区域就是 TDZ。

### 追问五：递归为什么会导致栈溢出？

普通递归的每一层调用都要保留自己的执行状态和返回位置，并压入新的活动上下文。如果递归没有终止或深度过大，调用栈容量就会耗尽。

### 追问六：执行上下文和 Event Loop 有什么关系？

调用栈管理当前同步执行的上下文；事件循环负责在合适的时机从任务或 Job 队列取出待执行工作。只有当前调用栈清空后，运行时才会开始处理后续任务。Event Loop 会在后面的独立文章展开。

## 易错点

- 不要把“创建阶段/执行阶段”的教学模型说成引擎必须逐字实现的物理步骤。
- 不要说 `let` 和 `const` 完全没有提升；应该解释绑定创建、初始化与 TDZ。
- 不要说函数出栈后所有局部数据立即销毁；闭包可能让词法环境继续存活。
- 不要把作用域链理解成函数调用链；它由词法嵌套关系决定。
- 不要混淆 JavaScript 引擎和宿主环境。定时器、网络请求等通常由浏览器或 Node.js 宿主提供。

## 动手实验

### 实验一：预测调用顺序

先不要运行，写出输出结果：

```js
function first() {
  console.log('first:start')
  second()
  console.log('first:end')
}

function second() {
  console.log('second')
}

console.log('global:start')
first()
console.log('global:end')
```

答案：

```text
global:start
first:start
second
first:end
global:end
```

尝试在每一行输出前画出当时的调用栈。

### 实验二：区分创建与初始化

```js
console.log(a)
// console.log(b)

var a = 1
let b = 2
```

先运行，再取消第二行注释。解释为什么第一次得到 `undefined`，第二次却抛出 `ReferenceError`。

### 实验三：证明调用实例彼此独立

```js
function makeLabel(prefix) {
  let count = 0

  return () => `${prefix}-${++count}`
}

const userLabel = makeLabel('user')
const orderLabel = makeLabel('order')

console.log(userLabel())
console.log(userLabel())
console.log(orderLabel())
```

解释两个闭包为什么各自维护独立的 `prefix` 和 `count`。

## 自测题

建议闭卷回答，每题控制在 1～2 分钟。

1. 什么是 JavaScript 执行上下文？
2. 每次调用同一个函数，会复用同一个执行上下文吗？
3. 调用栈与执行上下文是什么关系？
4. `var`、函数声明、`let` 在声明前访问时有什么区别？
5. 为什么词法作用域由定义位置而不是调用位置决定？
6. 函数返回后，为什么闭包仍能访问局部变量？
7. 执行上下文和作用域有什么区别？
8. 递归为什么可能造成 `Maximum call stack size exceeded`？

## 2 分钟复述模板

> 执行上下文是 ECMAScript 用来跟踪代码运行状态的规范抽象。执行脚本或调用函数时，运行时会建立相应上下文，其中包含代码执行状态、当前函数、Realm、词法环境和变量环境等信息。
>
> 活动执行上下文由调用栈管理，当前运行的上下文位于栈顶。调用函数时新上下文入栈，函数返回后出栈。词法环境保存标识符绑定，并通过外层环境引用形成变量查找链。
>
> 执行上下文不能和作用域混为一谈：作用域主要由代码定义位置决定，而执行上下文是每次运行或函数调用产生的动态状态。函数上下文出栈后，如果其中的词法环境仍被闭包引用，相关绑定仍然可以继续存活。

## 官方延伸阅读

- [MDN：JavaScript execution model](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
- [ECMAScript 规范：Execution Contexts](https://tc39.es/ecma262/#sec-execution-contexts)
- [ECMAScript 规范：Environment Records](https://tc39.es/ecma262/#sec-environment-records)

第一遍不建议硬啃完整规范。先用本文建立模型，能稳定复述后，再通过规范确认术语和边界。

## 复习记录

- [ ] 完成三个动手实验
- [ ] 闭卷回答八道自测题
- [ ] 完成 2 分钟口述
- [ ] 1 天后复习
- [ ] 3 天后复习
- [ ] 7 天后复习
- [ ] 14 天后复习

下一篇：[作用域、作用域链与闭包](./README.md)（待编写）
