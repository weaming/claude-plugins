# Telegram Plugin

Telegram channel plugin for Claude Code with Markdown to HTML conversion.

## Features

- Markdown to HTML auto-conversion
- Nested list bullets: ● / ○ / ▪
- Default format: `markdown` (instead of `text`)

## Installation

```bash
claude mcp add telegram -e TELEGRAM_BOT_TOKEN=your_token bun -- run --cwd $PLUGIN_DIR --shell=bun --silent start
```

Or use the Claude Code plugin manager to install from this repo.

## Usage

Messages are automatically formatted as Telegram-friendly HTML:
- `**bold**` → `<b>bold</b>`
- `*italic*` → `<i>italic</i>`
- `` `code` `` → `<code>code</code>`
- `- item` → `● item`
- Nested lists use `●` / `○` / `▪`
