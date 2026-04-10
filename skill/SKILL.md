---
name: axiclick
description: |
  Desktop automation discipline for macOS using axiclick. Enforces focus verification,
  visual confirmation, and structured click workflows to prevent blind actions.
  Proactively apply these rules whenever axiclick commands are used in the session.
  Use when the SessionStart hook shows axiclick is available and you need to interact
  with desktop applications, click UI elements, type text, or navigate between apps.
---

# axiclick — Desktop Automation Discipline

## Iron Laws

1. **Verify focus before every action.** Run `axiclick active` before typing or clicking. If the wrong window is active, run `axiclick focus <app>` and verify again.
2. **Never assume success.** After every click, type, or navigation, run `axiclick screenshot <path>` and read it to confirm the expected result.
3. **Never guess coordinates.** Use `axiclick som` to detect elements, then `axiclick som-click @<id>`. If a label is ambiguous, use `axiclick probe <path> <x>,<y>` to visually verify before clicking.
4. **Use programmatic app management.** Bring apps forward with `axiclick focus <app>`, not by clicking the dock or using keyboard shortcuts. `focus` also launches and unminimizes.
5. **Wait after UI changes.** Insert `axiclick wait 300` to `axiclick wait 500` after clicks, focus changes, and navigation. Some apps need `axiclick wait 1000`.

## Standard Workflow

Every desktop interaction follows this loop:

```
1. axiclick focus <app>              # bring app to front
2. axiclick wait 500                 # let it render
3. axiclick active                   # VERIFY correct window is focused
4. axiclick som /tmp/s.png           # detect all UI elements
5. <read the annotated screenshot>   # find target element @id
6.   — if label is clear:
       axiclick som-click @<id>      # click it
     — if label is uncertain:
       axiclick probe /tmp/s.png <x>,<y>   # mark the point
       <read the probe image>              # visually verify
       axiclick probe /tmp/s.png <x>,<y> --click  # click after confirming
7. axiclick wait 300                 # let the action complete
8. axiclick screenshot /tmp/v.png    # VERIFY the result
```

Do NOT skip steps 3 (verify focus) or 8 (verify result). These catch the two most common failure modes.

## Recovery Protocol

- **Wrong window active:** `axiclick focus <app>` → `axiclick wait 500` → `axiclick active` → confirm, then retry.
- **Clicked wrong element:** `axiclick screenshot` to assess state, then re-run `axiclick som` and identify the correct target.
- **Element not found in som:** Try `axiclick snapshot` for native macOS apps, or scroll the view with `axiclick scroll down` and re-run som.
- **3 failed attempts:** Stop and ask the user. Do not brute-force.

## Command Quick Reference

### Perception (read the screen)

| Command | Speed | Use when |
|---------|-------|----------|
| `som <path>` | ~2s warm | Default. Detects all UI elements with numbered marks. |
| `som-click @<id>` | instant | Click an element from the last som run. |
| `screenshot <path>` | instant | Quick verification after actions. |
| `probe <path> <x>,<y>` | instant | Verify a coordinate visually before clicking. Add `--click` to execute. |
| `snapshot` | instant | Accessibility tree for native macOS apps (Finder, Safari, Xcode). |
| `active` | instant | Check which window is focused. Run before every action sequence. |
| `windows` | ~1s | List all open windows with positions. |
| `focused` | instant | Check which UI element has keyboard focus. |
| `screen` | instant | Display resolution and Retina info. |
| `position` | instant | Current mouse cursor coordinates. |
| `color <x>,<y>` | instant | Sample pixel color at a position. |

### Input (act on the screen)

| Command | Use when |
|---------|----------|
| `click <x>,<y>` | Click at known coordinates. Prefer som-click when possible. |
| `rclick <x>,<y>` | Right-click. |
| `dclick <x>,<y>` | Double-click (select word). |
| `tclick <x>,<y>` | Triple-click (select line). |
| `type "<text>"` | Type text. Target field must be focused first. |
| `key <key>` | Special keys: return, tab, esc, arrow-up/down/left/right, delete, space, f1-f16. |
| `combo <mod+key>` | Keyboard shortcut (e.g., cmd+c). Prefer clicking UI elements instead. |
| `scroll <dir> [n]` | Scroll up/down/left/right. Default 5 lines. Use `--at <x>,<y>` to target. |
| `submit` | Smart form submit: dismisses autocomplete, re-focuses, presses Enter. |
| `drag <from> <to>` | Drag between two positions. |
| `move <x>,<y>` | Move cursor without clicking. |
| `wait <ms>` | Pause. Use 300-500ms after clicks, 500-1000ms after focus. |

### Navigation & App Management

| Command | Use when |
|---------|----------|
| `focus <app>` | Bring app to foreground. Launches if needed. Always use this over dock clicks. |
| `browse <url>` | Open URL in real browser. No CDP, invisible to anti-bot. |
| `swipe <dir>` | Touch swipe (iPhone Mirroring) or workspace switch. |

### Setup

| Command | Use when |
|---------|----------|
| `som-start` | Start of session. Preloads models for fast som (~2s vs ~15s cold). |
| `som-stop` | End of session. Frees GPU memory. |
| `som-setup` | First time only. Downloads OmniParser models (~2GB). |

## Anti-patterns

- **Typing into the void.** Always verify focus with `axiclick active` before `axiclick type`. Window focus can be lost between commands.
- **Keyboard shortcuts over clicking.** `combo` and `keydown` get intercepted by the wrong app or trigger unexpected actions. Click the UI element directly with `som-click` instead. Exception: `key return` and `key esc` are universally safe.
- **Repeated som calls.** Run som once, plan all your clicks from that pass, then execute them. Use `screenshot` for quick checks between actions.
- **Skipping verification.** Every action can fail silently. A screenshot costs nothing and catches mistakes immediately.
- **Clicking dock icons.** Use `axiclick focus <app>`. It's more reliable, handles launching and unminimizing, and doesn't require knowing icon positions.
- **Cold som.** Run `axiclick som-start` at the beginning of every session. Cold som takes ~15s, warm takes ~2s.
