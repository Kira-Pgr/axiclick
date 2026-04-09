// Shell execution helpers
const { execFileSync, execSync } = require('child_process');

function run(cmd, args = [], opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: opts.timeout || 10000,
      ...opts,
    }).trim();
  } catch (e) {
    if (e.stderr) return { error: e.stderr.trim() };
    return { error: e.message };
  }
}

function runShell(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 10000,
      ...opts,
    }).trim();
  } catch (e) {
    if (e.stderr) return { error: e.stderr.trim() };
    return { error: e.message };
  }
}

function osascript(script) {
  return run('osascript', ['-e', script], { timeout: 30000 });
}

module.exports = { run, runShell, osascript };
