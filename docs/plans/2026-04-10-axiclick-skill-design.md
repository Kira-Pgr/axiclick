# axiclick Claude Code Skill — Design

## Overview

A Claude Code skill that enforces disciplined desktop automation workflows when using axiclick. Lives at `~/.claude/skills/axiclick/SKILL.md`, installed globally via `axiclick install`.

## Problem

Agents using axiclick make three categories of mistakes:
1. **Lost focus** — typing/clicking into the wrong window
2. **No verification** — assuming actions succeeded without checking
3. **Guessing coordinates** — clicking blind instead of using som/probe

## Design

### Trigger
Proactive. When the SessionStart hook shows axiclick is available and the agent is about to interact with the desktop, the skill's discipline applies automatically.

### Sections

#### 1. Iron Laws
- Never click without verifying focus (`axiclick active`)
- Never assume success — `axiclick screenshot` to verify
- Never guess coordinates — use `som` or `snapshot`
- Use `axiclick focus` for app management, not dock/keyboard shortcuts
- Wait 300-500ms after every UI-changing action

#### 2. Standard Workflow
```
focus <app> → wait 500 → active (verify focus) →
som <path> → read annotated screenshot → identify target →
  if label uncertain: probe <path> <x>,<y> → verify visually
  if label clear: som-click @<id> →
wait 300 → screenshot (verify result)
```

#### 3. Recovery Protocol
- Verification fails: re-focus → re-som → retry
- Wrong element clicked: probe coordinates, adjust
- Max 3 retries before escalating to user

#### 4. Compact Command Reference
Quick-ref table of commands with one-line descriptions and when to use each.

#### 5. Anti-patterns
- Typing without confirming focus
- Using combo/keydown for shortcuts (prefer som-click on UI elements)
- Repeated som calls instead of planning clicks from one pass
- Skipping verification screenshots

### Installation
`axiclick install` will:
1. Install SessionStart hooks (existing)
2. Copy SKILL.md to `~/.claude/skills/axiclick/SKILL.md` (new)

### Skill Format
Standard Claude Code skill frontmatter with:
- `name: axiclick`
- `description: ...`
- Proactive trigger guidance in the description
