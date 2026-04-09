#!/usr/bin/env node
'use strict';

const path = require('path');
const os = require('os');
const toon = require('../lib/toon');
const cliclick = require('../lib/cliclick');
const screen = require('../lib/screen');
const { getExecutablePath, collapseTilde, installHooks } = require('../lib/hooks');

const VERSION = '0.1.0';

// ── Helpers ──────────────────────────────────────────

function out(text) { process.stdout.write(text + '\n'); }
function die(msg, hints) { out(toon.error(msg, hints)); process.exit(1); }

function parseCoords(str) {
  if (!str) return null;
  // Support "100,200" or "100 200" or "+50,+50"
  const parts = str.includes(',') ? str.split(',') : str.split(/\s+/);
  if (parts.length !== 2) return null;
  return parts;
}

function requireCoords(str, cmd) {
  const coords = parseCoords(str);
  if (!coords) die(`Expected coordinates: x,y`, [`Run \`axiclick ${cmd} <x>,<y>\``]);
  return coords;
}

function checkCliclick() {
  if (!cliclick.findCliclick()) {
    die('cliclick not found', [
      'Install with: brew install cliclick',
      'Or build from source: https://github.com/BlueM/cliclick',
    ]);
  }
}

function confirmAction(action, details) {
  const fields = { action };
  if (details) Object.assign(fields, details);
  out(toon.obj('result', fields));
}

// ── Commands ─────────────────────────────────────────

const commands = {};

// No-args: content-first home view
commands[''] = function home() {
  const binPath = collapseTilde(getExecutablePath());
  const pos = cliclick.getPosition();
  const act = screen.active();
  const disps = screen.displays();

  const parts = [
    `bin: ${binPath}`,
    `description: Agent ergonomic interface for macOS mouse, keyboard, and screen automation. Requires cliclick.`,
  ];

  // Mouse position
  if (pos && !pos.error) {
    parts.push(toon.obj('mouse', { x: pos.x, y: pos.y }));
  }

  // Active window
  if (act && !act.error) {
    parts.push(toon.obj('active', {
      app: act.app,
      title: act.title || '(none)',
      position: `${act.x},${act.y}`,
      size: `${act.w}x${act.h}`,
    }));
  }

  // Display info
  if (Array.isArray(disps) && disps.length) {
    const main = disps.find(d => d.main) || disps[0];
    parts.push(toon.obj('screen', {
      resolution: `${main.width}x${main.height}`,
      retina: main.retina ? 'yes' : 'no',
      displays: disps.length,
    }));
  }

  // Accessibility check
  checkCliclick();

  parts.push(toon.help([
    'Run `axiclick click <x>,<y>` to click at a position',
    'Run `axiclick type "<text>"` to type text',
    'Run `axiclick screenshot <path>` to capture the screen',
    'Run `axiclick windows` to list open windows',
    'Run `axiclick <command> --help` for details on any command',
  ]));

  out(toon.section(parts));
};

commands['click'] = function cmdClick(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick click <x>,<y>\n\nLeft-click at the given screen coordinates.\nCoordinates can be absolute (100,200), relative (+50,+0), or current position (.).\n\nExamples:\n  axiclick click 100,200\n  axiclick click +50,+0\n  axiclick click .`);
    return;
  }
  checkCliclick();
  const [x, y] = requireCoords(args[0], 'click');
  const result = cliclick.click(x, y);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('click', { position: `${x},${y}` });
};

commands['rclick'] = function cmdRclick(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick rclick <x>,<y>\n\nRight-click at the given screen coordinates.\n\nExamples:\n  axiclick rclick 100,200`);
    return;
  }
  checkCliclick();
  const [x, y] = requireCoords(args[0], 'rclick');
  const result = cliclick.rclick(x, y);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('right-click', { position: `${x},${y}` });
};

commands['dclick'] = function cmdDclick(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick dclick <x>,<y>\n\nDouble-click at the given screen coordinates.\n\nExamples:\n  axiclick dclick 100,200`);
    return;
  }
  checkCliclick();
  const [x, y] = requireCoords(args[0], 'dclick');
  const result = cliclick.dclick(x, y);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('double-click', { position: `${x},${y}` });
};

commands['tclick'] = function cmdTclick(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick tclick <x>,<y>\n\nTriple-click at the given screen coordinates.\n\nExamples:\n  axiclick tclick 100,200`);
    return;
  }
  checkCliclick();
  const [x, y] = requireCoords(args[0], 'tclick');
  const result = cliclick.tclick(x, y);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('triple-click', { position: `${x},${y}` });
};

commands['move'] = function cmdMove(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick move <x>,<y>\n\nMove the mouse cursor to the given coordinates.\n\nExamples:\n  axiclick move 500,300\n  axiclick move +100,+0`);
    return;
  }
  checkCliclick();
  const [x, y] = requireCoords(args[0], 'move');
  const result = cliclick.move(x, y);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('move', { position: `${x},${y}` });
};

commands['drag'] = function cmdDrag(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick drag <x1>,<y1> <x2>,<y2>\n\nDrag from one position to another.\n\nExamples:\n  axiclick drag 100,200 300,400`);
    return;
  }
  checkCliclick();
  const from = parseCoords(args[0]);
  const to = parseCoords(args[1]);
  if (!from || !to) die('Expected two coordinate pairs', ['Run `axiclick drag <x1>,<y1> <x2>,<y2>`']);
  const result = cliclick.drag(from[0], from[1], to[0], to[1]);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('drag', { from: `${from[0]},${from[1]}`, to: `${to[0]},${to[1]}` });
};

commands['type'] = function cmdType(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick type <text>\n\nType the given text string using keyboard events.\n\nExamples:\n  axiclick type "Hello world"\n  axiclick type "user@example.com"`);
    return;
  }
  checkCliclick();
  const text = args.join(' ');
  if (!text) die('Expected text to type', ['Run `axiclick type "<text>"`']);
  const result = cliclick.type(text);
  if (typeof result === 'object' && result.error) die(result.error);
  const preview = text.length > 80 ? text.slice(0, 77) + '...' : text;
  confirmAction('type', { text: `"${preview}"`, length: text.length });
};

commands['key'] = function cmdKey(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick key <key>\n\nPress and release a key.\nFor modifier combos, use keydown/keyup.\n\nKeys: arrow-up, arrow-down, arrow-left, arrow-right, backspace, delete, end,\n  enter, escape, f1-f16, home, mute, page-down, page-up, return, space, tab,\n  volume-down, volume-up\n\nExamples:\n  axiclick key return\n  axiclick key escape\n  axiclick key f5`);
    return;
  }
  checkCliclick();
  const key = args[0];
  if (!key) die('Expected a key name', ['Run `axiclick key <key>` — e.g., return, escape, tab, arrow-up']);
  const result = cliclick.keypress(key);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('keypress', { key });
};

commands['keydown'] = function cmdKeydown(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick keydown <modifiers>\n\nHold down modifier keys. Use keyup to release.\nModifiers: cmd, alt, ctrl, fn, shift (comma-separated)\n\nExamples:\n  axiclick keydown cmd\n  axiclick keydown cmd,shift`);
    return;
  }
  checkCliclick();
  const keys = args[0];
  if (!keys) die('Expected modifier keys', ['Run `axiclick keydown <modifiers>` — e.g., cmd, alt, ctrl, shift']);
  const result = cliclick.keydown(keys);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('keydown', { modifiers: keys });
  out(toon.help([`Run \`axiclick keyup ${keys}\` to release`]));
};

commands['keyup'] = function cmdKeyup(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick keyup <modifiers>\n\nRelease held modifier keys.\nModifiers: cmd, alt, ctrl, fn, shift (comma-separated)\n\nExamples:\n  axiclick keyup cmd\n  axiclick keyup cmd,shift`);
    return;
  }
  checkCliclick();
  const keys = args[0];
  if (!keys) die('Expected modifier keys', ['Run `axiclick keyup <modifiers>` — e.g., cmd, alt, ctrl, shift']);
  const result = cliclick.keyup(keys);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('keyup', { modifiers: keys });
};

commands['combo'] = function cmdCombo(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick combo <modifier+key> [<modifier+key> ...]\n\nPress a keyboard shortcut (modifier combo + key).\nSeparate modifiers from the key with +.\n\nExamples:\n  axiclick combo cmd+c\n  axiclick combo cmd+shift+z\n  axiclick combo alt+tab`);
    return;
  }
  checkCliclick();
  const combo = args[0];
  if (!combo || !combo.includes('+')) die('Expected modifier+key combo', ['Run `axiclick combo <modifier+key>` — e.g., cmd+c, cmd+shift+z']);
  const parts = combo.split('+');
  const key = parts.pop();
  const mods = parts.join(',');
  const r1 = cliclick.keydown(mods);
  if (typeof r1 === 'object' && r1.error) die(r1.error);
  const r2 = cliclick.keypress(key);
  const r3 = cliclick.keyup(mods);
  if (typeof r2 === 'object' && r2.error) die(r2.error);
  confirmAction('combo', { keys: combo });
};

commands['position'] = function cmdPosition(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick position\n\nPrint the current mouse cursor position.\n\nExamples:\n  axiclick position`);
    return;
  }
  checkCliclick();
  const pos = cliclick.getPosition();
  if (pos.error) die(pos.error);
  out(toon.obj('mouse', { x: pos.x, y: pos.y }));
};

commands['color'] = function cmdColor(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick color <x>,<y>\n\nSample the pixel color at the given screen coordinates.\nReturns RGB values (0-255) and hex code.\n\nExamples:\n  axiclick color 100,200\n  axiclick color .`);
    return;
  }
  checkCliclick();
  const coord = args[0] || '.';
  let x, y;
  if (coord === '.') {
    const pos = cliclick.getPosition();
    if (pos.error) die(pos.error);
    x = pos.x; y = pos.y;
  } else {
    [x, y] = requireCoords(coord, 'color');
  }
  const color = cliclick.getColor(x, y);
  if (color.error) die(color.error);
  out(toon.obj('color', {
    position: `${x},${y}`,
    rgb: `${color.r},${color.g},${color.b}`,
    hex: color.hex,
  }));
};

commands['screenshot'] = function cmdScreenshot(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick screenshot <path> [--region <x>,<y>,<w>,<h>] [--display <n>]\n\nCapture a screenshot and save to the given path.\nSupports PNG and JPEG based on file extension.\n\nFlags:\n  --region <x>,<y>,<w>,<h>  Capture a specific region\n  --display <n>             Capture specific display (1=main, 2=secondary)\n  --no-shadow               Exclude window shadow\n\nExamples:\n  axiclick screenshot /tmp/screen.png\n  axiclick screenshot /tmp/region.png --region 0,0,800,600`);
    return;
  }
  // Parse path and flags
  let filepath = null;
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) {
      const [rx, ry, rw, rh] = args[++i].split(',').map(Number);
      opts.region = { x: rx, y: ry, w: rw, h: rh };
    } else if (args[i] === '--display' && args[i + 1]) {
      opts.display = +args[++i];
    } else if (args[i] === '--no-shadow') {
      opts.shadow = false;
    } else if (!args[i].startsWith('--')) {
      filepath = args[i];
    }
  }
  if (!filepath) die('Expected output file path', ['Run `axiclick screenshot <path>`']);
  // Default to PNG
  if (!path.extname(filepath)) filepath += '.png';
  const result = screen.screenshot(filepath, opts);
  if (result.error) die(result.error);
  out(toon.obj('screenshot', {
    path: filepath,
    size: `${Math.round(result.size / 1024)}KB`,
  }));
};

commands['windows'] = function cmdWindows(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick windows [--app <name>]\n\nList all visible windows with positions and sizes.\n\nFlags:\n  --app <name>  Filter to a specific application\n\nExamples:\n  axiclick windows\n  axiclick windows --app Safari`);
    return;
  }
  let appFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app' && args[i + 1]) appFilter = args[++i];
  }
  let wins = screen.windows();
  if (typeof wins === 'object' && wins.error) die(wins.error);
  if (appFilter) {
    const lower = appFilter.toLowerCase();
    wins = wins.filter(w => w.app.toLowerCase().includes(lower));
  }
  if (!wins.length) {
    out(appFilter ? `windows: 0 visible windows for "${appFilter}"` : 'windows: 0 visible windows');
    return;
  }
  out(toon.table('windows', wins, ['id', 'app', 'title', 'x', 'y', 'w', 'h']));
  out(toon.help([
    'Run `axiclick click <x>,<y>` to click on a window',
    'Run `axiclick active` to see the focused window',
  ]));
};

commands['active'] = function cmdActive(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick active\n\nShow the currently focused application and window.\n\nExamples:\n  axiclick active`);
    return;
  }
  const act = screen.active();
  if (act.error) die(act.error);
  out(toon.obj('active', {
    app: act.app,
    title: act.title || '(none)',
    position: `${act.x},${act.y}`,
    size: `${act.w}x${act.h}`,
  }));
};

commands['screen'] = function cmdScreen(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick screen\n\nShow display information.\n\nExamples:\n  axiclick screen`);
    return;
  }
  const disps = screen.displays();
  if (typeof disps === 'object' && disps.error) die(disps.error);
  if (!disps.length) { out('screen: no displays detected'); return; }
  out(toon.table('displays', disps.map((d, i) => ({
    id: i + 1,
    name: d.name || 'Display',
    resolution: `${d.width}x${d.height}`,
    retina: d.retina ? 'yes' : 'no',
    main: d.main ? 'yes' : 'no',
  })), ['id', 'name', 'resolution', 'retina', 'main']));
};

commands['snapshot'] = function cmdSnapshot(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick snapshot [--depth <n>]\n\nShow the accessibility tree of the frontmost app.\nEach element gets a @uid for use with \`axiclick ax-click\` and \`axiclick ax-fill\`.\n\nFlags:\n  --depth <n>  Max tree depth (default: 10)\n\nNotes:\n  Works best with native macOS apps (Finder, Safari, Xcode, System Settings).\n  Cross-platform apps (Electron, WeChat) may expose minimal trees.\n\nExamples:\n  axiclick snapshot\n  axiclick snapshot --depth 5`);
    return;
  }
  let depth = '10';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--depth' && args[i + 1]) depth = args[++i];
  }
  const helperPath = path.join(__dirname, '..', 'lib', 'ax-helper');
  const { run: execRun } = require('../lib/exec');
  const fs = require('fs');
  if (!fs.existsSync(helperPath)) {
    // Compile on first use
    const { runShell } = require('../lib/exec');
    const srcPath = path.join(__dirname, '..', 'lib', 'ax-helper.swift');
    const compileResult = runShell(`swiftc -O "${srcPath}" -o "${helperPath}"`, { timeout: 60000 });
    if (typeof compileResult === 'object' && compileResult.error) die('Failed to compile ax-helper: ' + compileResult.error);
  }
  const result = execRun(helperPath, ['snapshot', depth], { timeout: 15000 });
  if (typeof result === 'object' && result.error) die(result.error);
  out(result);
  out(toon.help([
    'Run `axiclick ax-click @<uid>` to click an element',
    'Run `axiclick ax-fill @<uid> "<text>"` to set a text field',
    'Run `axiclick snapshot --depth 5` for a shallower tree',
  ]));
};

commands['ax-click'] = function cmdAxClick(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick ax-click @<uid>\n\nClick an accessibility element by its UID from the last snapshot.\nUIDs are assigned fresh each snapshot — always snapshot first.\n\nExamples:\n  axiclick ax-click @5\n  axiclick ax-click @42`);
    return;
  }
  const uid = (args[0] || '').replace('@', '');
  if (!uid || isNaN(+uid)) die('Expected @uid', ['Run `axiclick snapshot` first, then `axiclick ax-click @<uid>`']);
  const helperPath = path.join(__dirname, '..', 'lib', 'ax-helper');
  const { run: execRun } = require('../lib/exec');
  const result = execRun(helperPath, ['click', uid], { timeout: 15000 });
  if (typeof result === 'object' && result.error) die(result.error);
  out(result);
};

commands['ax-fill'] = function cmdAxFill(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick ax-fill @<uid> <text>\n\nSet the value of a text field by its UID from the last snapshot.\n\nExamples:\n  axiclick ax-fill @7 "Hello world"\n  axiclick ax-fill @3 "search query"`);
    return;
  }
  const uid = (args[0] || '').replace('@', '');
  const text = args.slice(1).join(' ');
  if (!uid || isNaN(+uid)) die('Expected @uid', ['Run `axiclick snapshot` first, then `axiclick ax-fill @<uid> "<text>"`']);
  if (!text) die('Expected text', ['Run `axiclick ax-fill @<uid> "<text>"`']);
  const helperPath = path.join(__dirname, '..', 'lib', 'ax-helper');
  const { run: execRun } = require('../lib/exec');
  const result = execRun(helperPath, ['fill', uid, text], { timeout: 15000 });
  if (typeof result === 'object' && result.error) die(result.error);
  out(result);
};

commands['scroll'] = function cmdScroll(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick scroll <direction> [<amount>] [--at <x>,<y>]\n\nScroll in the given direction. Amount defaults to 5 (lines).\nDirections: up, down, left, right\n\nFlags:\n  --at <x>,<y>  Scroll at a specific position (moves mouse first)\n\nExamples:\n  axiclick scroll down\n  axiclick scroll up 10\n  axiclick scroll down 3 --at 500,400`);
    return;
  }
  checkCliclick();
  const dir = args[0];
  if (!dir || !['up', 'down', 'left', 'right'].includes(dir)) {
    die('Expected direction: up, down, left, right', ['Run `axiclick scroll <direction> [amount]`']);
  }
  let amount = 5;
  let atPos = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--at' && args[i + 1]) { atPos = args[++i]; }
    else if (!isNaN(+args[i])) { amount = +args[i]; }
  }
  // Move mouse to position first if --at specified
  if (atPos) {
    const [ax, ay] = requireCoords(atPos, 'scroll --at');
    cliclick.move(ax, ay);
  }
  let dy = 0, dx = 0;
  if (dir === 'up') dy = amount;
  else if (dir === 'down') dy = -amount;
  else if (dir === 'left') dx = amount;
  else if (dir === 'right') dx = -amount;
  const { run: execRun } = require('../lib/exec');
  const helperPath = path.join(__dirname, '..', 'lib', 'scroll-helper');
  const fs = require('fs');
  let result;
  if (fs.existsSync(helperPath)) {
    result = execRun(helperPath, [String(dy), String(dx)]);
  } else {
    // Fallback: compile on first use
    const { runShell } = require('../lib/exec');
    const srcPath = path.join(__dirname, '..', 'lib', 'scroll-helper.swift');
    runShell(`swiftc -O "${srcPath}" -o "${helperPath}"`, { timeout: 60000 });
    result = execRun(helperPath, [String(dy), String(dx)]);
  }
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('scroll', { direction: dir, amount });
};

commands['focus'] = function cmdFocus(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick focus <app-name>\n\nBring an application to the foreground.\n\nExamples:\n  axiclick focus Safari\n  axiclick focus "Google Chrome"\n  axiclick focus Finder`);
    return;
  }
  const appName = args.join(' ');
  if (!appName) die('Expected application name', ['Run `axiclick focus <app-name>`']);
  const { osascript } = require('../lib/exec');
  const result = osascript(`tell application "${appName}" to activate`);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('focus', { app: appName });
};

commands['wait'] = function cmdWait(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick wait <ms>\n\nWait for the given number of milliseconds.\n\nExamples:\n  axiclick wait 500\n  axiclick wait 2000`);
    return;
  }
  checkCliclick();
  const ms = args[0];
  if (!ms || isNaN(+ms)) die('Expected milliseconds', ['Run `axiclick wait <ms>` — e.g., 500']);
  const result = cliclick.wait(ms);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('wait', { ms: +ms });
};

commands['run'] = function cmdRun(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick run <cliclick-commands>\n\nPass raw cliclick commands through directly.\nUseful for complex sequences.\n\nExamples:\n  axiclick run "c:100,200 t:hello w:500 kp:return"`);
    return;
  }
  checkCliclick();
  const raw = args.join(' ');
  if (!raw) die('Expected cliclick commands', ['Run `axiclick run "c:100,200 t:hello"` — raw cliclick syntax']);
  const result = cliclick.raw(raw);
  if (typeof result === 'object' && result.error) die(result.error);
  confirmAction('run', { commands: raw });
};

// ── SoM (Set-of-Mark) via OmniParser ─────────────────

const AXICLICK_DIR = path.join(os.homedir(), '.axiclick');
const SOM_VENV = path.join(AXICLICK_DIR, 'venv');
const SOM_MODELS = path.join(AXICLICK_DIR, 'models');
const SOM_PYTHON = path.join(SOM_VENV, 'bin', 'python3');
const SOM_CLI = path.join(__dirname, '..', 'lib', 'omniparser_cli.py');

function somReady() {
  const fs = require('fs');
  return fs.existsSync(SOM_PYTHON) &&
    fs.existsSync(path.join(SOM_MODELS, 'icon_detect', 'model.pt')) &&
    fs.existsSync(path.join(SOM_MODELS, 'icon_caption_florence', 'model.safetensors'));
}

commands['som-setup'] = function cmdSomSetup(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick som-setup\n\nSet up OmniParser V2 for Set-of-Mark element detection.\nCreates ~/.axiclick/ with a Python venv and downloads models from HuggingFace.\nRequires ~2GB disk space. Run once.\n\nExamples:\n  axiclick som-setup`);
    return;
  }
  const fs = require('fs');
  const { runShell } = require('../lib/exec');

  // 1. Create directory
  fs.mkdirSync(AXICLICK_DIR, { recursive: true });
  out('som-setup:');

  // 2. Create venv
  if (!fs.existsSync(SOM_PYTHON)) {
    out('  step: creating Python venv...');
    const venvResult = runShell(`python3 -m venv "${SOM_VENV}"`, { timeout: 30000 });
    if (typeof venvResult === 'object' && venvResult.error) die('Failed to create venv: ' + venvResult.error);
  } else {
    out('  step: venv exists');
  }

  // 3. Install deps
  out('  step: installing dependencies (this may take a few minutes)...');
  const reqPath = path.join(__dirname, '..', 'lib', 'omniparser_requirements.txt');
  const pipResult = runShell(
    `"${SOM_PYTHON}" -m pip install --quiet -r "${reqPath}"`,
    { timeout: 600000 }
  );
  if (typeof pipResult === 'object' && pipResult.error) {
    die('Failed to install dependencies: ' + pipResult.error);
  }
  out('  step: dependencies installed');

  // 4. Download models
  const yoloModel = path.join(SOM_MODELS, 'icon_detect', 'model.pt');
  const captionModel = path.join(SOM_MODELS, 'icon_caption_florence', 'model.safetensors');

  if (!fs.existsSync(yoloModel) || !fs.existsSync(captionModel)) {
    out('  step: downloading OmniParser V2 models from HuggingFace (~2GB)...');
    fs.mkdirSync(path.join(SOM_MODELS, 'icon_detect'), { recursive: true });
    fs.mkdirSync(path.join(SOM_MODELS, 'icon_caption_florence'), { recursive: true });

    // Download using huggingface_hub from the venv
    const dlScript = `
import os
from huggingface_hub import hf_hub_download

models_dir = "${SOM_MODELS.replace(/"/g, '\\"')}"

# Icon detection model
for f in ["model.pt", "model.yaml", "train_args.yaml"]:
    hf_hub_download("microsoft/OmniParser-v2.0", f"icon_detect/{f}",
                    local_dir=models_dir, local_dir_use_symlinks=False)

# Caption model (Florence2)
for f in ["config.json", "generation_config.json", "model.safetensors"]:
    hf_hub_download("microsoft/OmniParser-v2.0", f"icon_caption/{f}",
                    local_dir=models_dir, local_dir_use_symlinks=False)

# Rename icon_caption -> icon_caption_florence if needed
src = os.path.join(models_dir, "icon_caption")
dst = os.path.join(models_dir, "icon_caption_florence")
if os.path.exists(src) and not os.path.exists(dst):
    os.rename(src, dst)
elif os.path.exists(src) and os.path.exists(dst):
    import shutil
    for f in os.listdir(src):
        shutil.move(os.path.join(src, f), os.path.join(dst, f))
    os.rmdir(src)

print("done")
`.trim();

    const dlResult = runShell(
      `"${SOM_PYTHON}" -c '${dlScript.replace(/'/g, "'\\''")}'`,
      { timeout: 600000 }
    );
    if (typeof dlResult === 'object' && dlResult.error) {
      die('Failed to download models: ' + dlResult.error);
    }

    // Download Florence2 processor files (tokenizer, preprocessor)
    const procScript = `
from transformers import AutoProcessor
proc = AutoProcessor.from_pretrained("microsoft/Florence-2-base-ft", trust_remote_code=True)
proc.save_pretrained("${SOM_MODELS.replace(/"/g, '\\"')}/icon_caption_florence")
print("done")
`.trim();
    out('  step: downloading Florence2 processor...');
    const procResult = runShell(
      `"${SOM_PYTHON}" -c '${procScript.replace(/'/g, "'\\''")}'`,
      { timeout: 120000 }
    );
    if (typeof procResult === 'object' && procResult.error) {
      die('Failed to download processor: ' + procResult.error);
    }

    out('  step: models downloaded');
  } else {
    out('  step: models exist');
  }

  out('  status: ready');
  out(toon.help([
    'Run `axiclick som <output-path>` to take a SoM-annotated screenshot',
    'Run `axiclick som /tmp/som.png` to try it out',
  ]));
};

const LAST_SOM_JSON = path.join(AXICLICK_DIR, 'last-som.json');
const SOM_SOCK = path.join(AXICLICK_DIR, 'som.sock');
const SOM_SERVER = path.join(__dirname, '..', 'lib', 'omniparser_server.py');

/** Returns true if the server socket exists and responds to a health ping. */
function somServerRunning() {
  const fs = require('fs');
  if (!fs.existsSync(SOM_SOCK)) return false;
  // Quick TCP-like probe: attempt a synchronous connection via nc
  const { runShell } = require('../lib/exec');
  const probe = runShell(`echo '{"action":"ping"}' | nc -U -w 1 "${SOM_SOCK}"`, { timeout: 3000 });
  return typeof probe === 'string' && probe.includes('pong');
}

commands['som'] = function cmdSom(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick som <output-path> [--box-threshold <n>] [--iou-threshold <n>] [--imgsz <n>] [--no-caption]\n\nTake a screenshot, detect UI elements with OmniParser V2, and save an\nannotated image with numbered marks (Set-of-Mark prompting).\nElement list is saved to ~/.axiclick/last-som.json for use with som-click.\n\nIf the SoM daemon is running (\`axiclick som-start\`), uses it for fast\nresponse without cold-starting Python each time.\n\nRequires: \`axiclick som-setup\` to be run first.\n\nFlags:\n  --box-threshold <n>  Detection confidence threshold (default: 0.05)\n  --iou-threshold <n>  Overlap removal threshold (default: 0.1)\n  --imgsz <n>          Detection resolution (default: 640)\n  --no-caption         Skip AI captioning (faster)\n\nExamples:\n  axiclick som /tmp/som.png\n  axiclick som /tmp/som.png --no-caption\n  axiclick som /tmp/som.png --imgsz 1280`);
    return;
  }

  if (!somReady()) {
    die('OmniParser not set up', ['Run `axiclick som-setup` first (~2GB download, one-time)']);
  }

  // Parse args
  let outputPath = null;
  const passthrough = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      passthrough.push(args[i]);
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        passthrough.push(args[++i]);
      }
    } else if (!outputPath) {
      outputPath = args[i];
    }
  }

  if (!outputPath) die('Expected output path', ['Run `axiclick som <output-path>`']);

  const fs = require('fs');
  const { run: execRun } = require('../lib/exec');

  // Take screenshot first
  const tmpScreenshot = `/tmp/axiclick-som-input-${Date.now()}.png`;
  const ssResult = screen.screenshot(tmpScreenshot);
  if (ssResult.error) die(ssResult.error);

  // Detect Retina scale factor
  const disps = screen.displays();
  const scale = (Array.isArray(disps) && disps.length && disps.find(d => d.main)?.retina) ? 2 : 1;

  let toonOutput;

  if (somServerRunning()) {
    // ── Server path: POST to Unix socket ──────────────────────────────────
    const { runShell } = require('../lib/exec');
    const req = JSON.stringify({
      action: 'run',
      image: tmpScreenshot,
      output: outputPath,
      scale,
      passthrough,
      jsonOut: LAST_SOM_JSON,
    });
    // Use nc to talk to the Unix socket (synchronous, single request)
    const escapedReq = req.replace(/'/g, "'\\''");
    const resp = runShell(
      `echo '${escapedReq}' | nc -U -w 30 "${SOM_SOCK}"`,
      { timeout: 120000 }
    );
    try { require('fs').unlinkSync(tmpScreenshot); } catch {}
    if (typeof resp === 'object' && resp.error) die('Server error: ' + resp.error);
    let parsed;
    try { parsed = JSON.parse(resp); } catch {
      die('Malformed server response', [resp.slice ? resp.slice(0, 200) : String(resp)]);
    }
    if (parsed.error) die(parsed.error);
    toonOutput = parsed.toon;
  } else {
    // ── Cold-start CLI path ────────────────────────────────────────────────
    const result = execRun(SOM_PYTHON, [
      SOM_CLI, tmpScreenshot, outputPath,
      '--scale', String(scale),
      '--json-out', LAST_SOM_JSON,
      ...passthrough,
    ], { timeout: 120000 });

    try { fs.unlinkSync(tmpScreenshot); } catch {}

    if (typeof result === 'object' && result.error) die(result.error);
    toonOutput = result;
  }

  out(toonOutput);
  out(toon.help([
    'Run `axiclick som-click @<id>` to click an element by its mark ID',
    'Run `axiclick som /tmp/som.png --no-caption` for faster detection',
    'Run `axiclick som-start` to preload models as a background daemon',
  ]));
};

commands['som-click'] = function cmdSomClick(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick som-click @<id>\n\nClick the center of a SoM element from the last \`axiclick som\` run.\nElement coordinates are read from ~/.axiclick/last-som.json.\n\nExamples:\n  axiclick som-click @3\n  axiclick som-click @12`);
    return;
  }

  checkCliclick();

  const raw = (args[0] || '').replace('@', '');
  const id = parseInt(raw, 10);
  if (!raw || isNaN(id) || id < 1) {
    die('Expected @<id>', ['Run `axiclick som` first, then `axiclick som-click @<id>`']);
  }

  const fs = require('fs');
  if (!fs.existsSync(LAST_SOM_JSON)) {
    die('No SoM data found', ['Run `axiclick som <output-path>` first to detect elements']);
  }

  let elements;
  try {
    elements = JSON.parse(fs.readFileSync(LAST_SOM_JSON, 'utf8'));
  } catch (e) {
    die('Failed to read last-som.json: ' + e.message);
  }

  const elem = elements.find(el => el.id === id);
  if (!elem) {
    die(`Element @${id} not found`, [
      `Last run detected ${elements.length} element(s): @1–@${elements.length}`,
      'Run `axiclick som <output-path>` again to refresh',
    ]);
  }

  // Click center of bounding box (coordinates are already screen-ready)
  const cx = Math.round(elem.x + elem.w / 2);
  const cy = Math.round(elem.y + elem.h / 2);

  const result = cliclick.click(cx, cy);
  if (typeof result === 'object' && result.error) die(result.error);

  confirmAction('som-click', {
    id: `@${id}`,
    label: elem.label || `(${elem.kind})`,
    position: `${cx},${cy}`,
  });
};

const SOM_PID_FILE = path.join(AXICLICK_DIR, 'som-server.pid');

commands['som-start'] = function cmdSomStart(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick som-start\n\nStart the OmniParser model-preloading daemon in the background.\nThe daemon listens on a Unix socket at ~/.axiclick/som.sock and keeps\nYOLO, EasyOCR, and Florence2 models warm, so subsequent \`axiclick som\`\ncalls avoid the cold-start penalty.\n\nExamples:\n  axiclick som-start\n  axiclick som-stop`);
    return;
  }

  if (!somReady()) {
    die('OmniParser not set up', ['Run `axiclick som-setup` first (~2GB download, one-time)']);
  }

  if (somServerRunning()) {
    out(toon.obj('som-server', { status: 'already-running', socket: SOM_SOCK }));
    return;
  }

  const fs = require('fs');
  const { spawn } = require('child_process');

  // Remove stale socket/pid if present
  try { fs.unlinkSync(SOM_SOCK); } catch {}

  const child = spawn(SOM_PYTHON, [SOM_SERVER], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();
  fs.writeFileSync(SOM_PID_FILE, String(child.pid));

  // Wait up to 30 s for the socket to appear and respond
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    // Busy-poll with a tight sleep via Atomics (avoids spawning another process)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    if (somServerRunning()) { ready = true; break; }
  }

  if (!ready) {
    die('Server did not start within 30 s', [
      'Check that OmniParser models are present: axiclick som-setup',
      `PID file: ${SOM_PID_FILE}`,
    ]);
  }

  out(toon.obj('som-server', {
    status: 'started',
    pid: child.pid,
    socket: SOM_SOCK,
  }));
  out(toon.help([
    'Run `axiclick som <output-path>` — will now use the warm server',
    'Run `axiclick som-stop` to shut the server down',
  ]));
};

commands['som-stop'] = function cmdSomStop(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick som-stop\n\nStop the OmniParser model-preloading daemon.\n\nExamples:\n  axiclick som-stop`);
    return;
  }

  const fs = require('fs');

  // Send shutdown request via socket first (graceful)
  if (somServerRunning()) {
    const { runShell } = require('../lib/exec');
    runShell(`echo '{"action":"shutdown"}' | nc -U -w 3 "${SOM_SOCK}"`, { timeout: 5000 });
  }

  // Kill by PID if socket is gone but pid file remains
  if (fs.existsSync(SOM_PID_FILE)) {
    const pid = fs.readFileSync(SOM_PID_FILE, 'utf8').trim();
    try {
      process.kill(parseInt(pid, 10), 'SIGTERM');
    } catch {}
    try { fs.unlinkSync(SOM_PID_FILE); } catch {}
  }

  // Clean up socket file
  try { fs.unlinkSync(SOM_SOCK); } catch {}

  out(toon.obj('som-server', { status: 'stopped' }));
};

commands['install'] = function cmdInstall(args) {
  if (args[0] === '--help') {
    out(`usage: axiclick install\n\nSelf-install session hooks for Claude Code and Codex.\nRuns idempotently — safe to call multiple times.\n\nExamples:\n  axiclick install`);
    return;
  }
  const results = installHooks();
  out(toon.obj('hooks', {
    'claude-code': results.claude,
    codex: results.codex,
  }));
};

// ── Help ─────────────────────────────────────────────

commands['--help'] = function cmdHelp() {
  const cmdNames = Object.keys(commands).filter(c => c && !c.startsWith('-') && c !== 'install');
  out(`usage: axiclick [command] [args] [flags]`);
  out(`commands[${cmdNames.length}]:\n  ${cmdNames.join(', ')}`);
  out(`flags[2]:\n  --help, -V/--version`);
  out(toon.help([
    'Run `axiclick <command> --help` for details on any command',
    'Run `axiclick install` to set up session hooks for Claude Code / Codex',
  ]));
};
commands['-h'] = commands['--help'];

commands['-V'] = function cmdVersion() { out(`axiclick ${VERSION}`); };
commands['--version'] = commands['-V'];

// ── Main ─────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);
const handler = commands[cmd || ''];

if (!handler) {
  out(toon.error(`Unknown command: ${cmd}`, [
    'Run `axiclick --help` to see available commands',
  ]));
  process.exit(2);
}

try {
  handler(args || []);
} catch (e) {
  out(toon.error(e.message || String(e)));
  process.exit(1);
}
