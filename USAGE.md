# axiclick Agent Usage Guide

Detailed guide for AI agents automating macOS desktops with axiclick.

## Quick Start

```bash
brew install cliclick
npm install -g axiclick
axiclick som-setup           # one-time: installs OmniParser (~2GB)
axiclick som-start           # start model server (keeps models warm)
axiclick active              # verify the real frontmost window before SoM
```

## Strategy: How to Automate Any App

**Use SoM (Set-of-Mark) as your primary perception tool.** It works on every app regardless of accessibility support, detects both text and icons, and outputs screen-ready coordinates.

### Recommended workflow

```
1. axiclick focus <app>              # bring app to front
2. axiclick wait 500                 # let it render
3. axiclick active                   # confirm the window you expect is active
4. axiclick som /tmp/s.png           # detect all UI elements
5. <read the annotated screenshot>   # identify target element by @id
6. axiclick som-click @<id>          # click it
7. axiclick wait 500                 # let the action complete
8. axiclick screenshot /tmp/v.png    # verify the result
```

If `focus` brings an app forward but the actionable surface is inside a nested
window, like iPhone Mirroring, click once inside that window before the next
`som` pass.

### When to use each perception method

| Method | Speed | Accuracy | Works on | Use when |
|--------|-------|----------|----------|----------|
| **`som`** | ~1.5s (warm) | Best | All apps | Default choice. Always prefer this. |
| `screenshot` | Instant | N/A (visual only) | All apps | Quick verification after actions |
| `snapshot` | Instant | Good for native apps | Native macOS only | Finder, Safari, Xcode, System Settings |
| `windows` | ~1s | Exact | All apps | Finding window positions, listing open apps |

### Anti-patterns to avoid

- **Guessing coordinates.** Always use `som` or `snapshot` to get real coordinates.
- **Repeated SoM calls.** Run `som` once, plan all clicks, then execute. Use `screenshot` for quick checks between actions.
- **Forgetting `wait`.** After `focus`, `click`, or `som-click`, wait 300-500ms before the next perception command.
- **Ignoring `som-start`.** Cold SoM takes ~15s. With `som-start`, it takes ~1.5s.
- **Assuming app focus means input focus.** Check `axiclick active` for the real frontmost window and `axiclick focused` before typing into important fields.
- **Using keyboard shortcuts (`combo`, `keydown`).** Shortcuts get intercepted by the wrong app, trigger unexpected actions, or vary between apps. Prefer clicking UI elements directly with `som-click`. Only use `key return` and `key esc` which are universally safe.
- **Clicking text labels on phone screens.** SoM detects app name labels (tiny text below icons). The clickable icon is ~20px above the label. Adjust y coordinate upward when targeting app icons.

## Command Reference

### SoM (Set-of-Mark) — Recommended

SoM uses OmniParser V2 (YOLO icon detection + macOS Vision OCR) to detect every interactive element on screen, overlay numbered marks, and output a clickable element list.

#### `som-setup`

One-time setup. Creates `~/.axiclick/` with Python venv, installs dependencies, downloads OmniParser V2 models from HuggingFace.

```bash
axiclick som-setup
```

Requires ~2GB disk. Takes 2-5 minutes.

#### `som-start` / `som-stop`

Start or stop the model server. The server keeps YOLO and Florence2 loaded in GPU memory (MPS) so subsequent `som` calls are fast.

```bash
axiclick som-start           # preload models, ~1.5s per som after this
axiclick som-stop            # free memory when done
```

#### `som <output-path>`

Take a screenshot, detect all UI elements, save annotated image with numbered marks.

```bash
axiclick som /tmp/screen.png
axiclick som /tmp/screen.png --no-caption      # skip icon captioning (faster)
axiclick som /tmp/screen.png --imgsz 1280      # higher detection resolution
```

Output (TOON format):
```
som:
  path: /tmp/screen.png
  size: 3200KB
  elements: 145
  scale: 2.0x (coords are screen-ready)
marks[145]{id,kind,label,x,y,w,h}:
  1,text,File,123,8,24,15
  2,text,Edit,165,8,26,15
  3,text,Search,160,97,49,15
  4,icon,,620,940,37,32
  ...
```

All coordinates are **screen-ready** — use them directly with `click` or `som-click`. Retina scaling is handled automatically.

The element list is saved to `~/.axiclick/last-som.json` for use by `som-click`.

`som` captures the current desktop view, not just a single app subtree. When
working with a small target window, use `axiclick windows` and `axiclick active`
to confirm the correct surface is frontmost before relying on the marks.

#### `som-click @<id>`

Click an element from the last `som` run by its mark ID. Computes the center of the element's bounding box and clicks it.

```bash
axiclick som-click @3        # clicks the center of element #3
```

Output:
```
result:
  action: som-click
  id: @3
  label: Search
  position: 184,104
```

This is the most reliable way to click UI elements. Always prefer `som` + `som-click` over raw `click x,y`.

### Input

#### `click <x>,<y>`

Left-click at screen coordinates.

```bash
axiclick click 100,200       # absolute
axiclick click +50,+0        # relative to current position
axiclick click .             # click at current position
```

#### `rclick <x>,<y>` / `dclick <x>,<y>` / `tclick <x>,<y>`

Right-click, double-click, or triple-click.

```bash
axiclick rclick 100,200
axiclick dclick 100,200      # select a word
axiclick tclick 100,200      # select a line
```

#### `move <x>,<y>`

Move the mouse cursor without clicking.

```bash
axiclick move 500,300
```

#### `drag <from> <to>`

Drag from one position to another.

```bash
axiclick drag 100,200 300,400
```

#### `type <text>`

Type text using keyboard events. Works in any focused text field.

```bash
axiclick type "Hello world"
```

**Important:** The target text field must be focused first. Use `som-click` or `click` to focus it before typing.

#### `submit [--at <x>,<y>]`

Submit the current text input. Useful on sites that keep autocomplete or
suggestion popovers open after typing.

```bash
axiclick type "my query"
axiclick submit
axiclick submit --at 500,467
```

`submit` waits briefly, clicks away to dismiss suggestions, re-focuses the
input, and then presses Return.

#### `key <key>`

Press a special key. Available keys:

```
arrow-up, arrow-down, arrow-left, arrow-right
return, enter, tab, space, esc, delete, fwd-delete
home, end, page-up, page-down
f1-f16, mute, volume-up, volume-down
```

```bash
axiclick key return          # press Enter
axiclick key esc             # press Escape
axiclick key tab             # press Tab
```

`axiclick key` uses macOS System Events for web-relevant special keys like
`return`, `tab`, and the arrow keys so browsers receive real DOM key events.

**Note:** `key` only works with special keys listed above. For letter keys, use `type`. For keyboard shortcuts, use `keydown`/`keyup` or `combo`.

#### `keydown <modifiers>` / `keyup <modifiers>`

Hold or release modifier keys. Modifiers: `cmd`, `alt`, `ctrl`, `fn`, `shift` (comma-separated).

```bash
axiclick keydown cmd         # hold Command
axiclick type "a"            # types Cmd+A (Select All)
axiclick keyup cmd           # release Command
```

#### `combo <modifier+key>`

Press a keyboard shortcut. Separate modifiers from the key with `+`. The final key can be a letter or any special key supported by `axiclick key`; this uses `keydown` + `keypress` + `keyup` internally.

```bash
axiclick combo cmd+c         # Copy
axiclick combo cmd+v         # Paste
axiclick combo cmd+shift+z   # Redo
axiclick combo alt+tab       # App switcher
```

#### `scroll <direction> [amount]`

Scroll in a direction. Amount defaults to 5 lines.

```bash
axiclick scroll down         # scroll down 5 lines
axiclick scroll up 10        # scroll up 10 lines
axiclick scroll down 3 --at 500,400   # scroll at a specific position
```

Directions: `up`, `down`, `left`, `right`.

#### `wait <ms>`

Pause execution.

```bash
axiclick wait 500            # wait 500ms
```

Use between actions to let the UI update. Typical values: 300-500ms after clicks, 500-1000ms after app focus.

#### `run <raw-commands>`

Pass raw cliclick commands. Useful for complex sequences.

```bash
axiclick run "c:100,200 t:hello w:500 kp:return"
```

See [cliclick documentation](https://github.com/BlueM/cliclick) for command syntax.

### Perception

#### `screenshot <path>`

Capture the screen to a PNG file. Instant — use for quick verification.

```bash
axiclick screenshot /tmp/s.png
axiclick screenshot /tmp/r.png --region 0,0,800,600    # capture region
axiclick screenshot /tmp/d.png --display 2              # secondary display
```

#### `windows`

List all visible windows with positions and sizes.

```bash
axiclick windows
axiclick windows --app Safari    # filter by app
```

Output:
```
windows[3]{id,app,title,x,y,w,h}:
  1,Finder,Desktop,296,149,920,436
  2,Safari,GitHub,124,33,1396,789
  3,WeChat,Weixin,58,72,1216,758
```

#### `active`

Show the currently focused app and window.

```bash
axiclick active
```

#### `screen`

Show display information (resolution, Retina status).

```bash
axiclick screen
```

#### `position`

Print current mouse cursor coordinates.

```bash
axiclick position
```

#### `color <x>,<y>`

Sample the pixel color at a position. Returns RGB + hex.

```bash
axiclick color 100,200
axiclick color .             # at current mouse position
```

#### `focused`

Show the UI element that currently has keyboard focus.

```bash
axiclick focused
```

Use this to verify a real text field is active before calling `type` or
`submit`.

### Accessibility (AXUIElement)

Native macOS accessibility tree. Works great with built-in apps, limited with cross-platform apps.

#### `snapshot`

Walk the accessibility tree of the frontmost app and output elements with UIDs.

```bash
axiclick snapshot
axiclick snapshot --depth 5
```

#### `ax-click @<uid>` / `ax-fill @<uid> <text>`

Click or fill an accessibility element by UID.

```bash
axiclick ax-click @5
axiclick ax-fill @7 "search query"
```

**When to use:** Prefer `snapshot` + `ax-click` for native macOS apps (Finder, Safari, System Settings, Xcode) where the accessibility tree is rich. Fall back to `som` + `som-click` for everything else.

### Navigation

#### `browse <url>`

Open a URL in a browser. Uses the system `open` command — no CDP, no automation flags, completely invisible to anti-bot systems. Then use `som` + `som-click` + `type` to interact with the page visually.

```bash
axiclick browse https://perplexity.ai
axiclick browse https://example.com --app Safari
```

**Why use this instead of `chrome-devtools-axi`?** Sites with anti-bot detection (Cloudflare, reCAPTCHA, etc.) block CDP-based automation. axiclick operates via real mouse/keyboard events — indistinguishable from a human.

#### `swipe <direction>`

Two modes:

**Touch swipe** — for iPhone Mirroring and touch interfaces:

```bash
axiclick swipe next --at 1050,450           # next page (drag left)
axiclick swipe prev --at 1050,450           # previous page (drag right)
axiclick swipe down --at 1050,450           # scroll down
```

**Workspace swipe** — switch macOS desktops:

```bash
axiclick swipe workspace next               # next desktop
axiclick swipe workspace prev               # previous desktop
```

`swipe workspace` uses a native helper that opens Mission Control, targets the adjacent space thumbnail on the active display, and presses it through Accessibility. It does not use `cliclick` or rely on a hardcoded keyboard shortcut.

Touch directions: `left`, `right`, `up`, `down`, `next` (=left), `prev` (=right).
Workspace directions: `next`, `prev`.

Flags: `--at <x>,<y>`, `--distance <px>` (default 200), `--duration <ms>` (default 300).

### App Management

#### `focus <app-name>`

Bring an application to the foreground. Also launches it if not running and unminimizes if minimized.

```bash
axiclick focus Safari
axiclick focus "Google Chrome"
axiclick focus Finder
```

**Prefer `focus` over dock clicking.** It's more reliable and doesn't require knowing the dock icon position.

## Examples

### Open Safari and navigate to a URL

```bash
axiclick focus Safari
axiclick wait 500
axiclick som /tmp/safari.png --no-caption
# Find the address bar @id from SoM output
axiclick som-click @<address-bar-id>
axiclick wait 300
axiclick type "https://example.com"
axiclick key return
```

### Copy text from one app to another

```bash
axiclick focus "Source App"
axiclick wait 500
axiclick som /tmp/src.png --no-caption
axiclick som-click @<text-element-id>
axiclick combo cmd+a           # select all
axiclick combo cmd+c           # copy
axiclick focus "Target App"
axiclick wait 500
axiclick som /tmp/tgt.png --no-caption
axiclick som-click @<input-field-id>
axiclick combo cmd+v           # paste
```

### Interact with a non-native app (e.g., WeChat)

```bash
axiclick focus WeChat
axiclick wait 1000
axiclick som /tmp/wechat.png --no-caption
# SoM detects all visible text and icons even without accessibility support
axiclick som-click @<chat-entry-id>
axiclick wait 500
axiclick screenshot /tmp/verify.png     # quick verify
axiclick som /tmp/wechat2.png --no-caption
axiclick som-click @<input-box-id>
axiclick type "Hello!"
axiclick key return
```

### Browse a site with anti-bot protection

```bash
axiclick browse https://perplexity.ai
axiclick wait 3000                          # let page fully load
axiclick som /tmp/page.png --no-caption     # detect page elements
# Find the input field @id from SoM output
axiclick som-click @<input-id>              # click it (real mouse event)
axiclick wait 300
axiclick type "my search query"             # real keyboard events
axiclick key return                         # submit
axiclick wait 5000                          # wait for results
axiclick screenshot /tmp/results.png        # capture results
```

No CDP, no WebDriver, no automation flags. Just pixels and clicks.

### Swipe through iPhone Mirroring pages

```bash
axiclick focus "iPhone Mirroring"
axiclick wait 1000
axiclick swipe next --at 1050,450           # next home screen page
axiclick wait 1000
axiclick som /tmp/iphone.png --no-caption   # detect apps
# Find the app — if SoM returns a text label, click ~20px above it for the icon
axiclick som-click @<app-label-id>
```

## Performance

| Operation | Cold | Warm (`som-start`) |
|-----------|------|-------------------|
| `som` (full) | ~15s | ~1.5s |
| `som --no-caption` | ~15s | ~1.5s |
| `screenshot` | instant | instant |
| `snapshot` | instant | instant |
| `som-click` | instant | instant |
| `focus` | <1s | <1s |
| `windows` | ~1s | ~1s |

Always run `axiclick som-start` at the beginning of a session.

## Troubleshooting

**"cliclick not found"** — Run `brew install cliclick`.

**"OmniParser not set up"** — Run `axiclick som-setup`.

**SoM is slow** — Run `axiclick som-start` to preload models. Check with `axiclick som-stop && axiclick som-start`.

**Accessibility permissions** — Go to System Settings > Privacy & Security > Accessibility and enable your terminal app.

**Special keys still do nothing in browsers** — macOS may prompt for Automation access the first time `axiclick key return` or `axiclick key tab` talks to `System Events`. Approve it in System Settings > Privacy & Security > Automation for your terminal app.

**SoM marks the wrong window** — Run `axiclick active` first. If the app is frontmost but the actionable surface is inside a child window like iPhone Mirroring, click inside that window once and rerun `som`.

**Clicking wrong elements** — Always use `som` + `som-click @<id>` instead of guessing coordinates. Read the annotated screenshot to verify which element has which ID.

**App doesn't come to front** — Use `axiclick focus <app-name>` + `axiclick wait 500` before any interaction. Some apps need up to 1000ms to fully activate.
