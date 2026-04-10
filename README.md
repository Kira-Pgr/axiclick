<p align="center">
  <h1 align="center">axiclick</h1>
  <p align="center">
    <strong>Desktop automation for AI agents on macOS</strong>
  </p>
  <p align="center">
    See the screen. Find elements. Click precisely. No coordinate guessing.
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/axiclick"><img src="https://img.shields.io/npm/v/axiclick?color=cb0000&label=npm" alt="npm"></a>
    <a href="https://github.com/Kira-Pgr/axiclick"><img src="https://img.shields.io/badge/macOS-only-000000?logo=apple&logoColor=white" alt="macOS"></a>
    <a href="https://github.com/kunchenguid/axi"><img src="https://img.shields.io/badge/AXI-compliant-blue" alt="AXI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT"></a>
  </p>
</p>

---

<p align="center">
  <video src="https://github.com/Kira-Pgr/axiclick/raw/main/assets/demo.mp4" width="720" autoplay loop muted playsinline>
    Your browser does not support the video tag.
  </video>
</p>

## Why axiclick?

Most desktop automation tools are built for humans scripting GUIs. axiclick is built for **AI agents** that need to control macOS apps — with token-efficient output, structured perception, and zero guesswork.

- **SoM (Set-of-Mark) perception** — detects every UI element on screen, labels them with `@id` tags, and lets you click by ID instead of fragile pixel coordinates
- **Token-efficient** — outputs [TOON](https://toonformat.dev)-formatted data designed for LLM context windows, not humans reading terminals
- **Full input control** — mouse clicks, drags, keyboard shortcuts, text typing, scrolling — everything an agent needs
- **Accessibility tree access** — query native macOS AXUIElement trees for apps that expose them
- **Agent session hooks** — self-installs into Claude Code and Codex so agents start with axiclick context automatically

## Quick Start

```bash
brew install cliclick        # required dependency
npm install -g axiclick      # install globally
```

Verify the install:

```bash
axiclick                     # shows mouse position, active window, display info
```

### Your first SoM workflow

The core loop: **screenshot → detect elements → click by ID → verify**.

```bash
axiclick som-setup                    # one-time: download OmniParser V2 models (~2GB)
axiclick som-start                    # start the detection daemon

axiclick focus Safari                 # bring target app to front
axiclick wait 500
axiclick som /tmp/page.png            # detect all UI elements → labeled image
axiclick som-click @12                # click element #12 by ID
axiclick screenshot /tmp/verify.png   # confirm the result
```

> **Tip:** If a nested surface like iPhone Mirroring is visible but not active, click inside that window first, then run `som`.

### Install session hooks

Auto-inject axiclick context into every Claude Code and Codex session:

```bash
axiclick install
```

## Commands

<details>
<summary><strong>SoM — Set-of-Mark perception</strong></summary>

| Command | Description | Example |
|---------|-------------|---------|
| `som-setup` | Install OmniParser V2 models and venv | `axiclick som-setup` |
| `som-start` | Start the warm SoM daemon | `axiclick som-start` |
| `som-stop` | Stop the warm SoM daemon | `axiclick som-stop` |
| `som <path>` | Capture and annotate visible UI elements | `axiclick som /tmp/screen.png --no-caption` |
| `som-click @<id>` | Click a marked element from the last SoM pass | `axiclick som-click @3` |

</details>

<details>
<summary><strong>Input — mouse, keyboard, text</strong></summary>

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
| `submit [--at x,y]` | Submit input after dismissing suggestions | `axiclick submit --at 500,467` |
| `scroll <dir> [n]` | Scroll | `axiclick scroll down 5` |
| `wait <ms>` | Wait | `axiclick wait 500` |
| `run <raw>` | Raw cliclick passthrough | `axiclick run "c:1,2 t:hi"` |

Coordinates support absolute (`100,200`), relative (`+50,+0`), and current position (`.`).

`key <key>` uses macOS System Events for web-relevant special keys like `return`, `tab`, and arrow keys so browsers receive real DOM key events reliably.

</details>

<details>
<summary><strong>Perception — screenshots, windows, display</strong></summary>

| Command | Description | Example |
|---------|-------------|---------|
| `screenshot <path>` | Capture screen to file | `axiclick screenshot /tmp/s.png` |
| `info <image>` | Show image dimensions and mapping metadata | `axiclick info /tmp/s.png` |
| `probe <image> <x>,<y>` | Mark an image pixel and resolve screen coords | `axiclick probe /tmp/s.png 940,644` |
| `windows` | List visible windows | `axiclick windows` |
| `active` | Show focused app/window | `axiclick active` |
| `screen` | Display info | `axiclick screen` |
| `position` | Mouse coordinates | `axiclick position` |
| `color <x>,<y>` | Sample pixel color | `axiclick color 100,200` |
| `focused` | Show the currently focused UI element | `axiclick focused` |

`screenshot` supports `--region <x>,<y>,<w>,<h>` and `--display <n>`. It writes a sidecar metadata file at `<path>.json` so `info` and `probe` can convert image pixels back into screen coordinates.

`probe` writes an annotated PNG with a crosshair. Add `--click` to click the resolved screen point.

`windows` supports `--app <name>` to filter.

</details>

<details>
<summary><strong>Accessibility — AXUIElement tree</strong></summary>

| Command | Description | Example |
|---------|-------------|---------|
| `snapshot` | Accessibility tree with UIDs | `axiclick snapshot` |
| `ax-click @<uid>` | Click element by UID | `axiclick ax-click @5` |
| `ax-fill @<uid> <text>` | Set text field value | `axiclick ax-fill @7 "query"` |

`snapshot` supports `--depth <n>` to limit tree depth.

> **Note:** Accessibility works best with native macOS apps (Finder, Safari, Xcode). Cross-platform apps (Electron, WeChat) may expose minimal trees — fall back to coordinate-based automation with `screenshot` + `click`.

</details>

<details>
<summary><strong>Meta</strong></summary>

| Command | Description |
|---------|-------------|
| `focus <app>` | Bring app to foreground |
| `install` | Install Claude Code / Codex session hooks |

</details>

## When to Use axiclick

| Scenario | Why axiclick |
|----------|-------------|
| Automate macOS apps with no CLI/API | Finder, WeChat, Xcode, System Settings |
| Sites that block headless browsers | Cloudflare, reCAPTCHA — real mouse/keyboard via actual display |
| iPhone Mirroring automation | Control iOS apps through the macOS mirroring window |
| QA test any GUI application | Screenshot → verify visual state programmatically |

## Agent Integration

Add to your `CLAUDE.md` or `AGENTS.md`:

```
Use `axiclick` for macOS desktop automation.
```

## Requirements

| Requirement | Details |
|-------------|---------|
| **OS** | macOS 10.15+ |
| **Runtime** | Node.js 18+ |
| **Dependencies** | [cliclick](https://github.com/BlueM/cliclick) (`brew install cliclick`) |
| **SoM models** | Python 3, ~2GB disk (for `som-setup`) |
| **Build tools** | Xcode Command Line Tools (compiles Swift helpers on first run) |
| **Permissions** | Accessibility for terminal app; Automation for System Events on first `key` use |

## Acknowledgments

- [cliclick](https://github.com/BlueM/cliclick) by Carsten Blum — the macOS mouse/keyboard engine axiclick wraps. BSD 3-Clause licensed.
- [AXI](https://github.com/kunchenguid/axi) — the agent ergonomic interface standard this tool follows.
- [OmniParser V2](https://github.com/microsoft/OmniParser) by Microsoft — the vision model powering Set-of-Mark detection.

## License

MIT — see [LICENSE](LICENSE) for details, including third-party notices.
