// macOS screen perception: screenshots, window listing, display info
const { run, runShell, osascript } = require('./exec');
const path = require('path');
const os = require('os');

// Take a screenshot
function screenshot(filepath, opts = {}) {
  const args = [];
  if (opts.region) {
    // region: {x, y, w, h}
    const { x, y, w, h } = opts.region;
    args.push('-R', `${x},${y},${w},${h}`);
  }
  if (opts.window) args.push('-l', String(opts.window));
  if (opts.display) args.push('-D', String(opts.display));
  if (!opts.cursor) args.push('-C'); // include cursor by default, -C flag
  if (opts.shadow === false) args.push('-o'); // no shadow
  args.push(filepath);
  const result = run('screencapture', args, { timeout: 15000 });
  if (typeof result === 'object' && result.error) return result;
  // Check file was created
  try {
    const fs = require('fs');
    const stat = fs.statSync(filepath);
    return { path: filepath, size: stat.size };
  } catch {
    return { error: 'Screenshot failed — file not created' };
  }
}

// List visible windows
function windows() {
  const script = `
tell application "System Events"
  set out to ""
  repeat with proc in (every application process whose visible is true)
    set appName to name of proc
    try
      repeat with win in (every window of proc)
        set winName to name of win
        set {x, y} to position of win
        set {w, h} to size of win
        set out to out & appName & "\\t" & winName & "\\t" & x & "\\t" & y & "\\t" & w & "\\t" & h & "\\n"
      end repeat
    end try
  end repeat
  return out
end tell`;
  const result = osascript(script);
  if (typeof result === 'object' && result.error) return result;
  if (!result.trim()) return [];
  return result.trim().split('\n').filter(Boolean).map((line, i) => {
    const [app, title, x, y, w, h] = line.split('\t');
    return { id: i + 1, app, title: title || '', x: +x, y: +y, w: +w, h: +h };
  });
}

// Get the active (frontmost) app and window
function active() {
  const appScript = `tell application "System Events" to get name of first application process whose frontmost is true`;
  const winScript = `
tell application "System Events"
  set proc to first application process whose frontmost is true
  set appName to name of proc
  try
    set win to front window of proc
    set winName to name of win
    set {x, y} to position of win
    set {w, h} to size of win
    return appName & "\\t" & winName & "\\t" & x & "\\t" & y & "\\t" & w & "\\t" & h
  on error
    return appName & "\\t" & "" & "\\t" & "0" & "\\t" & "0" & "\\t" & "0" & "\\t" & "0"
  end try
end tell`;
  const result = osascript(winScript);
  if (typeof result === 'object' && result.error) return result;
  const [app, title, x, y, w, h] = result.split('\t');
  return { app, title: title || '', x: +x, y: +y, w: +w, h: +h };
}

// Get display info
function displays() {
  // Use system_profiler for reliable display info
  const result = runShell("system_profiler SPDisplaysDataType 2>/dev/null");
  if (typeof result === 'object' && result.error) return result;
  const displays = [];
  let current = null;
  for (const line of result.split('\n')) {
    const resMatch = line.match(/Resolution:\s*(\d+)\s*x\s*(\d+)(?:\s*(Retina))?/);
    const mainMatch = line.match(/Main Display:\s*(Yes|No)/);
    const nameMatch = line.match(/^\s{8}(\S.+):$/);
    if (nameMatch) {
      if (current) displays.push(current);
      current = { name: nameMatch[1].trim() };
    }
    if (resMatch && current) {
      current.width = +resMatch[1];
      current.height = +resMatch[2];
      if (resMatch[3]) current.retina = true;
    }
    if (mainMatch && current) {
      current.main = mainMatch[1] === 'Yes';
    }
  }
  if (current) displays.push(current);
  return displays;
}

module.exports = { screenshot, windows, active, displays };
