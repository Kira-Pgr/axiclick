// TOON (Token-Oriented Object Notation) output helpers

function obj(name, fields) {
  const lines = [`${name}:`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    lines.push(`  ${k}: ${v}`);
  }
  return lines.join('\n');
}

function table(name, items, fields) {
  if (!items.length) return `${name}: 0 items`;
  const keys = fields || Object.keys(items[0]);
  const lines = [`${name}[${items.length}]{${keys.join(',')}}:`];
  for (const item of items) {
    const vals = keys.map(k => {
      const v = item[k];
      if (v === undefined || v === null) return '';
      const s = String(v);
      // quote if contains comma or starts/ends with whitespace
      if (s.includes(',') || s.includes('\n') || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
      return s;
    });
    lines.push(`  ${vals.join(',')}`);
  }
  return lines.join('\n');
}

function help(hints) {
  if (!hints.length) return '';
  const lines = [`help[${hints.length}]:`];
  for (const h of hints) lines.push(`  ${h}`);
  return lines.join('\n');
}

function error(msg, hints) {
  const lines = [`error: ${msg}`];
  if (hints && hints.length) {
    lines.push(help(hints));
  }
  return lines.join('\n');
}

function section(parts) {
  return parts.filter(Boolean).join('\n');
}

module.exports = { obj, table, help, error, section };
