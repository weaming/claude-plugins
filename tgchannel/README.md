# Telegram Unofficial Plugin

Telegram channel plugin for Claude Code with Markdown to HTML conversion and multi-instance support.

## Features

- **Markdown to HTML auto-conversion** - Messages are automatically formatted as Telegram-friendly HTML
- **Nested list bullets** - `●` / `○` / `▪` for visual hierarchy
- **Multi-instance support** - Connect multiple Claude CLI instances and switch between them via Telegram buttons

### Formatting Examples

| Markdown     | Telegram Output |
| ------------ | --------------- |
| `**bold**`   | **bold**        |
| `*italic*`   | _italic_        |
| `` `code` `` | `code`          |
| `- item`     | ● item          |
| `- nested`   | ○ nested        |

## Architecture

```
Telegram ←→ Center Manager ←→ Claude Client(s)
                    ↑
              Unix Socket
```

## Startup

### 1. Start Center Manager (must run first)

```bash
cd tgchannel/server
bun install
bun index.ts
```

### 2. Start Claude CLI

Restart Claude Code with the plugin loaded:

```bash
claude --dangerously-load-development-channels plugin:tgchannel@weaming-plugins
```

Multiple Claude CLI instances can connect. Only the **active instance** receives Telegram messages.

## Switching Instances

In Telegram, use `/switch` to list all connected instances and tap a button to switch.

## Commands

- `/start` - Welcome message
- `/switch` - Switch between Claude instances
