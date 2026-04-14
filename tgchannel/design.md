# tgchannel 多实例切换方案

## 背景

当前 tgchannel 插件每个 Claude CLI 实例独立连接 Telegram，同一时刻只有一个实例能作为 leader 接收消息。需要改为：

- **中心管理器**：一个独立进程连接 Telegram Bot，路由消息到指定 Claude CLI
- **多个 Claude CLI 实例**：各自运行，通过 IPC（如 unix socket / HTTP）与中心管理器通信
- **Telegram 内切换**：通过按钮列表选择与哪个 Claude 实例交互

---

## 一、Claude Plugin 工作原理

来源：`~/src/skills/docs/claude/en/agent-sdk/plugins.md` + `channels-reference.md`

### 架构

```
my-plugin/
├── .claude-plugin/plugin.json      # 元数据（可选）
├── skills/                         # prompt 注入，无运行时
│   └── my-skill/SKILL.md
├── .mcp.json                       # MCP 服务器声明
└── server.ts                       # 实际运行进程（通过 stdio 与 Claude 通信）
```

### 核心通信机制

1. **MCP 服务器（stdio）**：`.mcp.json` 声明的服务器作为子进程启动，通过 stdin/stdout 用 JSON-RPC 通信
2. **Channel 通知**：`notifications/claude/channel` 将外部事件注入会话，作为 `<channel source="telegram" ...>` 标签可见
3. **工具调用**：Claude 调用 `mcp__plugin_tgchannel_tgchannel__reply` 等工具，通过 stdio 发送 `CallToolRequest`

### 关键文件

| 文件          | 用途                                  |
| ------------- | ------------------------------------- |
| `.mcp.json`   | 声明如何启动 MCP 服务器               |
| `plugin.json` | 插件元数据、声明 channels 能力        |
| `server.ts`   | MCP 服务器 + Telegram Bot，长时间运行 |

---

## 二、~/.claude 目录结构

来源：实际探索

```
~/.claude/
├── settings.json              # 主配置（model, permissions, plugins）
├── sessions/                  # 按 PID 区分的会话 {pid}.json
│   └── {pid}.json            # pid, sessionId(UUID), cwd, startedAt, kind
├── session-env/              # 按 UUID 的空目录
├── transcripts/              # 会话记录 ses_{hash}.jsonl
│   └── ses_{hash}.jsonl      # 完整对话历史
├── projects/                 # 按项目路径隔离
│   └── -Users-.../           # 项目名作为目录名
│       └── {sessionId}.jsonl
├── plugins/                  # 插件相关
│   ├── installed_plugins.json
│   ├── cache/                # 插件包缓存
│   └── marketplaces/         # 市场 git 克隆
├── channels/                 # Channel 配置（如 tgchannel）
│   └── tgchannel/
│       ├── .env              # BOT_TOKEN
│       ├── access.json       # 允许列表
│       ├── telegram-channel.pid  # leader PID
│       └── inbox/            # 下载的附件
└── skills/                   # 技能符号链接
```

### 多实例区分方式

- **Session ID (UUID)**：每个 Claude CLI 启动时生成 UUID，存于 `sessions/{pid}.json`
- **PID**：操作系统进程 ID，用于 leader election
- **项目路径**：`projects/` 下按 cwd 隔离

---

## 三、整体架构设计

```
                    Telegram
                        │
                  ┌─────┴─────┐
                  │  Center   │  ← 独立进程，管理 Telegram 连接
                  │  Manager  │    (bun/Node MCP server)
                  └─────┬─────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    Unix Socket     Unix Socket    Unix Socket
         │              │              │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │Claude A │    │Claude B │    │Claude C │
    └─────────┘    └─────────┘    └─────────┘
```

### 组件

1. **Center Manager** (`manager/`)
   - 独立运行的 MCP 服务器，连接 Telegram Bot
   - 维护"当前活跃 Claude 实例"状态
   - 通过 unix socket 与各 Claude 实例通信
   - 暴露 MCP 工具：`switch_claude`, `list_instances`, `send_to_claude`

2. **Center MCP Server** (`.mcp.json` 注册)
   - 各 Claude CLI 内运行，作为该实例的"通道"
   - 接收 Center Manager 的指令（如切换当前实例）
   - 暴露工具：`reply`（转发给 Center Manager）

3. **Telegram UI 按钮**
   - 每次交互后更新消息/发送新消息，显示所有实例按钮
   - 按钮样式：`[Claude A - "hi buddy"] [Claude B - "hello"]`
   - 选择按钮 → 通知 Center Manager 切换 → 下一条消息路由到新实例

---

## 四、详细设计

### 4.1 目录结构

```
tgchannel/
├── manager/
│   ├── index.ts      # 主程序：MCP server + Telegram bot
│   ├── session-store.ts      # 管理已注册的 Claude 实例
│   ├── socket-server.ts      # Unix socket 服务器
│   └── .mcp.json
├── client/
│   ├── mcp.ts      # 每个 Claude CLI 内运行的插件
│   ├── socket-client.ts      # Unix socket 客户端
│   └── .mcp.json
├── tgchannel.skills/
│   └── switch/
│       └── SKILL.md          # /tgchannel:switch 技能
└── plugin.json
```

### 4.2 实例注册机制

每个 Claude CLI 启动时，通过 unix socket 发送注册消息：

```typescript
// 注册消息
{
  type: 'register',
  sessionId: 'uuid-xxx',
  pid: process.pid,
  label: 'Claude A',           // 可配置，默认 "Claude {pid}"
  lastMessage: 'hello buddy',   // 最近一条用户消息的前 N 字
  cwd: process.cwd()
}
```

Center Manager 维护实例列表，按最后消息时间排序。

### 4.3 消息路由

1. Telegram 消息到达 Center Manager
2. Center Manager 检查"当前活跃实例"
3. 消息转发到活跃实例的 unix socket
4. 该实例的 MCP server 发送 `notifications/claude/channel` 给 Claude
5. Claude 回复 → 调用 `reply` 工具 → socket 传 Center Manager → Telegram

### 4.4 切换机制

**方式一：按钮点击**

- Center Manager 在每条消息回复时更新 Inline Keyboard
- 按钮：`[label|last_msg_preview]` 如 `[Claude A|hi buddy]`
- 点击触发 `callback_query` → 解析 instance ID → 更新活跃实例

**方式二：命令**

- `/tgchannel:switch <name>` 在终端执行
- 通过 Center Manager 的管理接口（unix socket）切换

### 4.5 Claude CLI 判断是否回复到 TG

关键问题：多个 Claude 实例都收到同一份消息，如何避免重复回复？

**当前设计**：只有"活跃实例"会收到消息通知，非活跃实例不注入 channel 事件。

但需要解决：Center Manager 如何知道哪个实例是"活跃"的？

**方案**：

- 每个实例连接后默认都是"待命"状态
- 第一个连接注册为"当前活跃"
- 用户在 TG 点击按钮切换
- Center Manager 将活跃信息通过 socket 通知各实例
- 非活跃实例不处理 channel 消息（丢弃或忽略）

### 4.6 消息格式

**注册消息**

```json
{
  "type": "register",
  "sessionId": "454d11ae-ba25-4424-b60d-1d9b0a7ba3bb",
  "pid": 12345,
  "label": "Claude A",
  "lastMessage": "hi buddy",
  "cwd": "/Users/garden/src"
}
```

**切换消息**

```json
{
  "type": "switch",
  "toSessionId": "454d11ae-ba25-4424-b60d-1d9b0a7ba3bb"
}
```

**转发消息**

```json
{
  "type": "forward",
  "sessionId": "454d11ae-ba25-4424-b60d-1d9b0a7ba3bb",
  "content": "hello",
  "meta": {"chat_id": "123", "message_id": 456, "user": "weaming"}
}
```

**回复消息**

```json
{
  "type": "reply",
  "sessionId": "454d11ae-ba25-4424-b60d-1d9b0a7ba3bb",
  "chat_id": "123",
  "text": "Hello!"
}
```

---

## 五、实现计划

### Phase 1: Center Manager 核心

1. 创建 `manager/index.ts`
   - MCP 服务器（声明 `claude/channel` capabilities）
   - Telegram long polling
   - 管理实例注册表（sessionId → socket 连接）
   - 处理 `callback_query` 切换活跃实例
   - 消息路由到当前活跃实例

2. 创建 `manager/session-store.ts`
   - 维护活跃实例
   - 实例列表（label, lastMessage, sessionId, pid）
   - 按最后消息时间排序

3. 创建 `manager/socket-server.ts`
   - Unix socket 监听
   - 处理 register/switch/forward/reply 消息

### Phase 2: Claude Client 插件

4. 创建 `client/mcp.ts`
   - 连接 Center Manager unix socket
   - 发送注册消息
   - 接收 forward 消息并转发 MCP 通知
   - 接收 switch 消息更新状态
   - 处理 `reply` 工具调用，发送回复到 socket

5. 创建 `client/.mcp.json`
   - 声明 MCP 服务器

### Phase 3: 整合与 UI

6. 修改 Telegram 消息处理
   - 显示实例切换按钮
   - Inline keyboard 样式

7. 创建技能 `/tgchannel:switch`
   - 手动切换实例

---

## 六、关键文件

| 操作      | 文件路径                            |
| --------- | ----------------------------------- |
| ✅ 新建   | `tgchannel/server/index.ts`         |
| ✅ 新建   | `tgchannel/server/session-store.ts` |
| ✅ 新建   | `tgchannel/server/socket-server.ts` |
| ✅ 新建   | `tgchannel/server/.mcp.json`        |
| ✅ 新建   | `tgchannel/server/package.json`     |
| ✅ 新建   | `tgchannel/client/mcp.ts`           |
| ✅ 新建   | `tgchannel/client/socket-client.ts` |
| ✅ 新建   | `tgchannel/client/.mcp.json`        |
| ✅ 新建   | `tgchannel/skills/switch/SKILL.md`  |
| ⏳ 待修改 | `tgchannel/plugin.json`             |
| ⏳ 待完成 | 权限控制（access.json 检查）        |
| ⏳ 待完成 | 集成测试                            |

---

## 七、实现状态

### 已完成

1. **manager/**
   - `session-store.ts` - 实例注册、活跃管理
   - `socket-server.ts` - Unix socket 框架
   - `index.ts` - Telegram 连接、消息路由、按钮 UI、callback_query 处理
   - `.mcp.json` / `package.json` - 项目配置

2. **client/**
   - `socket-client.ts` - socket 客户端库
   - `mcp.ts` - MCP 服务器，接收 center 转发，权限 relay
   - `.mcp.json` - 项目配置

3. **skills/**
   - `skills/switch/SKILL.md` - `/tgchannel:switch` 技能

### 待完成

1. 权限控制 - index.ts 需要检查 access.json（沿用原 server.ts 的 gate 逻辑）
2. 集成测试

### 设计确认

- **Center**: 单一实例运行，管理 Telegram 连接和所有客户端 socket
- **Client**: 每个 Claude CLI 是"傻瓜客户端"，收到消息就转发给 Claude，Claude 回复全部发回 center
- **切换**: 用户在 TG 发 `/switch` → Center 回复实例列表 + Inline Buttons → 点击切换活跃实例
- **消息路由**: 只有活跃实例收到 forward 通知；非活跃实例忽略；所有客户端的回复都会发回 center（center 校验是否是活跃实例）

---

## 八、验证方式

1. 安装依赖：`cd tgchannel/server && bun install`
2. 启动 Center Manager：`bun run index.ts`
3. 启动 Claude CLI（配置使用 client/.mcp.json）
4. 在 Telegram 发送消息，确认消息路由到当前活跃实例
5. 点击按钮切换，确认消息路由变化

---

## 九、启动方式

### Center Manager（需先启动）

```bash
cd /Users/garden/src/claude-plugins-unofficial/tgchannel/server
bun install
bun run index.ts
```

### Claude CLI（启动后再启动这个）

需配置 `.mcp.json` 指向 `client/.mcp.json`，或者在 Claude Code 中启用该插件。

---

## 更新记录

- 2026-04-14：初稿，基于 plugin 架构和 channels 文档
- 2026-04-14：完成 manager/ 和 client/ 目录结构和核心文件
- 2026-04-14：修复 NetSocket 类型，添加 switch skill
- 2026-04-14：确认设计 - center 单实例，client 无状态，/switch 在 TG 内切换
