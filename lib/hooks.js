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

// Find an existing axiclick hook entry in the matcher+hooks format
function findAxiclickEntry(entries) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.hooks && Array.isArray(entry.hooks)) {
      const inner = entry.hooks.find(h => h.command && h.command.includes('axiclick'));
      if (inner) return { index: i, entry, inner };
    }
  }
  return null;
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

  // Migrate old flat format entries
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(h => {
    if (h.type === 'command' && h.command && h.command.includes('axiclick') && !h.hooks) {
      return false; // remove old-format entry
    }
    return true;
  });

  const hookCmd = `${execPath}`;
  const found = findAxiclickEntry(settings.hooks.SessionStart);

  if (found) {
    if (found.inner.command !== hookCmd) {
      found.inner.command = hookCmd;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return 'updated';
    }
    return 'exists';
  }

  settings.hooks.SessionStart.push({
    matcher: '',
    hooks: [{ type: 'command', command: hookCmd }],
  });

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return 'installed';
}

// Install Codex hook
function installCodexHook(execPath) {
  const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch {}

  if (!config.hooks) config.hooks = {};
  if (!config.hooks.SessionStart) config.hooks.SessionStart = [];

  // Migrate old flat format at root level (root.SessionStart → root.hooks.SessionStart)
  if (Array.isArray(config.SessionStart)) {
    config.SessionStart = config.SessionStart.filter(h => {
      if (h.type === 'command' && h.command && h.command.includes('axiclick')) {
        return false;
      }
      return true;
    });
    if (config.SessionStart.length === 0) delete config.SessionStart;
  }

  // Migrate old flat format inside hooks
  config.hooks.SessionStart = config.hooks.SessionStart.filter(h => {
    if (h.type === 'command' && h.command && h.command.includes('axiclick') && !h.hooks) {
      return false;
    }
    return true;
  });

  const hookCmd = `${execPath}`;
  const found = findAxiclickEntry(config.hooks.SessionStart);

  if (found) {
    if (found.inner.command !== hookCmd) {
      found.inner.command = hookCmd;
      fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
      return 'updated';
    }
    return 'exists';
  }

  config.hooks.SessionStart.push({
    matcher: '',
    hooks: [{ type: 'command', command: hookCmd }],
  });

  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
  return 'installed';
}

// Install Claude Code skill
function installSkill() {
  const skillDir = path.join(os.homedir(), '.claude', 'skills', 'axiclick');
  const skillDest = path.join(skillDir, 'SKILL.md');
  // Find the skill source relative to this file (lib/hooks.js → skill/SKILL.md)
  const skillSrc = path.join(__dirname, '..', 'skill', 'SKILL.md');

  if (!fs.existsSync(skillSrc)) return 'not-found';

  const srcContent = fs.readFileSync(skillSrc, 'utf8');

  // Check if already installed and up to date
  if (fs.existsSync(skillDest)) {
    const destContent = fs.readFileSync(skillDest, 'utf8');
    if (destContent === srcContent) return 'exists';
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillDest, srcContent);
  return fs.existsSync(skillDest) ? 'installed' : 'error';
}

function installHooks() {
  const execPath = getExecutablePath();
  const results = {};
  results.claude = installClaudeHook(execPath);
  results.codex = installCodexHook(execPath);
  results.skill = installSkill();
  return results;
}

module.exports = { installHooks, getExecutablePath, collapseTilde };
