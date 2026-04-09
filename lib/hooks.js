// Self-installing session hooks for Claude Code and Codex
const fs = require('fs');
const path = require('path');
const os = require('os');

function getExecutablePath() {
  // Resolve the absolute path of our entry point
  const binPath = path.resolve(process.argv[1]);
  return binPath;
}

function collapseTilde(p) {
  const home = os.homedir();
  if (p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}

// Install Claude Code hook
function installClaudeHook(execPath) {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {}

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  const hookCmd = `${execPath}`;
  const existing = settings.hooks.SessionStart.find(h =>
    h.type === 'command' && h.command && h.command.includes('axiclick')
  );

  if (existing) {
    // Path repair: update if changed
    if (existing.command !== hookCmd) {
      existing.command = hookCmd;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return 'updated';
    }
    return 'exists';
  }

  settings.hooks.SessionStart.push({
    type: 'command',
    command: hookCmd,
  });

  // Ensure directory exists
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return 'installed';
}

// Install Codex hook
function installCodexHook(execPath) {
  const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
  let hooks = {};
  try {
    hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch {}

  if (!hooks.SessionStart) hooks.SessionStart = [];

  const hookCmd = `${execPath}`;
  const existing = hooks.SessionStart.find(h =>
    h.type === 'command' && h.command && h.command.includes('axiclick')
  );

  if (existing) {
    if (existing.command !== hookCmd) {
      existing.command = hookCmd;
      fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2));
      return 'updated';
    }
    return 'exists';
  }

  hooks.SessionStart.push({
    type: 'command',
    command: hookCmd,
  });

  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2));
  return 'installed';
}

function installHooks() {
  const execPath = getExecutablePath();
  const results = {};
  results.claude = installClaudeHook(execPath);
  results.codex = installCodexHook(execPath);
  return results;
}

module.exports = { installHooks, getExecutablePath, collapseTilde };
