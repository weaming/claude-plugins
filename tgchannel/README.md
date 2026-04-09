# Telegram Unofficial Plugin

Telegram channel plugin for Claude Code with Markdown to HTML conversion.

## Features

- **Markdown to HTML auto-conversion** - Messages are automatically formatted as Telegram-friendly HTML
- **Nested list bullets** - `●` / `○` / `▪` for visual hierarchy
- **Default format: markdown** - No need to specify `format: 'html'` manually

### Formatting Examples

| Markdown     | Telegram Output |
| ------------ | --------------- |
| `**bold**`   | **bold**        |
| `*italic*`   | _italic_        |
| `` `code` `` | `code`          |
| `- item`     | ● item          |
| `- nested`   | ○ nested        |

## Installation

```bash
/plugin install tgchannel@weaming-plugins
/reload-plugins
```

## Enable Channel

Restart Claude Code with:

```bash
claude --dangerously-load-development-channels plugin:tgchannel@weaming-plugins
```

## Configuration

```bash
/tgchannel:configure <token>
```

## Pair Your Account

1. Open Telegram and send any message to your bot
2. The bot will reply with a pairing code
3. In Claude Code, run: `/tgchannel:access pair <code>`
4. Lock down access: `/tgchannel:access policy allowlist`

## Upgrading

```bash
/plugin marketplace update weaming-plugins
```
