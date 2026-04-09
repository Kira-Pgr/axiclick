// Wrapper around the cliclick binary
const { run } = require('./exec');

let cliclickPath = null;

function findCliclick() {
  if (cliclickPath) return cliclickPath;
  const result = run('which', ['cliclick']);
  if (typeof result === 'object' && result.error) return null;
  cliclickPath = result;
  return cliclickPath;
}

function exec(...actions) {
  const bin = findCliclick();
  if (!bin) return { error: 'cliclick not found. Install with: brew install cliclick' };
  const result = run(bin, actions);
  return result;
}

function execWithOutput(...actions) {
  const bin = findCliclick();
  if (!bin) return { error: 'cliclick not found. Install with: brew install cliclick' };
  return run(bin, ['-d', 'stdout', ...actions]);
}

// Get current mouse position
function getPosition() {
  const out = execWithOutput('p');
  if (typeof out === 'object' && out.error) return out;
  const [x, y] = out.split(',').map(Number);
  return { x, y };
}

// Get pixel color at position
function getColor(x, y) {
  const out = execWithOutput(`cp:${x},${y}`);
  if (typeof out === 'object' && out.error) return out;
  const [r, g, b] = out.trim().split(/\s+/).map(Number);
  const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  return { r, g, b, hex };
}

// Click at position
function click(x, y) { return exec(`c:${x},${y}`); }
function rclick(x, y) { return exec(`rc:${x},${y}`); }
function dclick(x, y) { return exec(`dc:${x},${y}`); }
function tclick(x, y) { return exec(`tc:${x},${y}`); }

// Mouse movement
function move(x, y) { return exec(`m:${x},${y}`); }

// Drag: from (x1,y1) to (x2,y2)
function drag(x1, y1, x2, y2, opts = {}) {
  const actions = [`dd:${x1},${y1}`];
  if (opts.easing) {
    // intermediate points for smoother drag
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mx = Math.round(x1 + (x2 - x1) * t);
      const my = Math.round(y1 + (y2 - y1) * t);
      actions.push(`dm:${mx},${my}`);
    }
  }
  actions.push(`du:${x2},${y2}`);
  return exec(...actions);
}

// Keyboard
function type(text) { return exec(`t:${text}`); }
function keypress(key) { return exec(`kp:${key}`); }
function keydown(keys) { return exec(`kd:${keys}`); }
function keyup(keys) { return exec(`ku:${keys}`); }

// Wait
function wait(ms) { return exec(`w:${ms}`); }

// Raw passthrough
function raw(actions) {
  const parts = actions.split(/\s+/);
  return exec(...parts);
}

module.exports = {
  findCliclick, exec, execWithOutput,
  getPosition, getColor,
  click, rclick, dclick, tclick,
  move, drag,
  type, keypress, keydown, keyup,
  wait, raw,
};
