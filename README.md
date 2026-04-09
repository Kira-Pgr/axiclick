# axiclick

[![npm](https://img.shields.io/npm/v/axiclick?color=cb0000&label=npm)](https://www.npmjs.com/package/axiclick)
[![macOS](https://img.shields.io/badge/macOS-only-000000?logo=apple&logoColor=white)](https://github.com/Kira-Pgr/axiclick)
[![AXI](https://img.shields.io/badge/AXI-compliant-blue)](https://github.com/kunchenguid/axi)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Agent-ergonomic macOS mouse, keyboard, and screen automation. Built on [AXI](https://github.com/kunchenguid/axi) principles — token-efficient [TOON](https://toonformat.dev) output, contextual help, content-first design.

Wraps [cliclick](https://github.com/BlueM/cliclick) for input and macOS native APIs for perception.

## Install

```bash
brew install cliclick        # required dependency
npm install -g axiclick      # install axiclick globally
```

Verify:

```bash
axiclick
```

You should see current mouse position, active window, and display info.

### Session hooks

Self-install into Claude Code and Codex so every session starts with axiclick context:

```bash
axiclick install
```

## Commands

### Input

| Command | Description | Example |
|---------|-------------|---------|
| `click <x>,<y>` | Left-click | `axiclick click 100,200` |
| `rclick <x>,<y>` | Right-click | `axiclick rclick 100,200` |
| `dclick <x>,<y>` | Double-click | `axiclick dclick 100,200` |
| `tclick <x>,<y>` | Triple-click | `axiclick tclick 100,200` |
| `move <x>,<y>` | Move cursor | `axiclick move 500,300` |
| `drag <from> <to>` | Drag between points | `axiclick drag 100,200 300,400` |
| `type <text>` | Type text | `axiclick type "Hello"` |
| `key <key>` | Press a key | `axiclick key return` |
| `keydown <mods>` | Hold modifier keys | `axiclick keydown cmd` |
| `keyup <mods>` | Release modifier keys | `axiclick keyup cmd` |
| `combo <mod+key>` | Keyboard shortcut | `axiclick combo cmd+c` |
| `scroll <dir> [n]` | Scroll | `axiclick scroll down 5` |
| `wait <ms>` | Wait | `axiclick wait 500` |
| `run <raw>` | Raw cliclick passthrough | `axiclick run "c:1,2 t:hi"` |

Coordinates support absolute (`100,200`), relative (`+50,+0`), and current position (`.`).

### Perception

| Command | Description | Example |
|---------|-------------|---------|
| `screenshot <path>` | Capture screen to file | `axiclick screenshot /tmp/s.png` |
| `windows` | List visible windows | `axiclick windows` |
| `active` | Show focused app/window | `axiclick active` |
| `screen` | Display info | `axiclick screen` |
| `position` | Mouse coordinates | `axiclick position` |
| `color <x>,<y>` | Sample pixel color | `axiclick color 100,200` |

`screenshot` supports `--region <x>,<y>,<w>,<h>` and `--display <n>`.

`windows` supports `--app <name>` to filter.

### Accessibility (AXUIElement)

| Command | Description | Example |
|---------|-------------|---------|
| `snapshot` | Accessibility tree with UIDs | `axiclick snapshot` |
| `ax-click @<uid>` | Click element by UID | `axiclick ax-click @5` |
| `ax-fill @<uid> <text>` | Set text field value | `axiclick ax-fill @7 "query"` |

`snapshot` supports `--depth <n>` to limit tree depth.

> **Note:** Accessibility works best with native macOS apps (Finder, Safari, Xcode). Cross-platform apps (Electron, WeChat) may expose minimal trees — fall back to coordinate-based automation with `screenshot` + `click`.

### Meta

| Command | Description |
|---------|-------------|
| `focus <app>` | Bring app to foreground |
| `install` | Install Claude Code / Codex session hooks |

## CLAUDE.md

Add to your `CLAUDE.md` or `AGENTS.md`:

```
Use `axiclick` for macOS desktop automation.
```

## Requirements

- macOS 10.15+
- Node.js 18+
- [cliclick](https://github.com/BlueM/cliclick) (`brew install cliclick`)
- Xcode Command Line Tools (for compiling Swift helpers on first run)
- Accessibility permissions for your terminal app

## License

MIT
