const fs = require('fs');

function sidecarPath(imagePath) {
  return `${imagePath}.json`;
}

function unionBounds(displays) {
  if (!Array.isArray(displays) || !displays.length) return null;
  const minX = Math.min(...displays.map(d => d.x));
  const minY = Math.min(...displays.map(d => d.y));
  const maxX = Math.max(...displays.map(d => d.x + d.width));
  const maxY = Math.max(...displays.map(d => d.y + d.height));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function commonScale(displays) {
  if (!Array.isArray(displays) || !displays.length) return null;
  const scale = displays[0].scale || 1;
  return displays.every(d => (d.scale || 1) === scale) ? scale : null;
}

function containsRect(display, rect) {
  return rect.x >= display.x &&
    rect.y >= display.y &&
    rect.x + rect.w <= display.x + display.width &&
    rect.y + rect.h <= display.y + display.height;
}

function buildMapping(originX, originY, scale, screenReady) {
  return {
    screenReady: !!screenReady,
    originX,
    originY,
    scale,
  };
}

function buildScreenshotMetadata(imagePath, opts = {}, displays = []) {
  const meta = {
    version: 1,
    source: 'screenshot',
    imagePath,
  };

  if (opts.region) {
    const rect = { ...opts.region };
    const containing = displays.find(display => containsRect(display, rect)) || null;
    const sharedScale = containing ? (containing.scale || 1) : commonScale(displays);
    meta.capture = {
      mode: 'region',
      region: rect,
      displayId: containing?.id || null,
      displayName: containing?.name || null,
    };
    meta.mapping = buildMapping(rect.x, rect.y, sharedScale, Number.isFinite(sharedScale));
    return meta;
  }

  if (opts.display) {
    const display = displays.find(d => d.id === opts.display) || null;
    meta.capture = {
      mode: 'display',
      displayId: display?.id || opts.display,
      displayName: display?.name || null,
      region: display ? { x: display.x, y: display.y, w: display.width, h: display.height } : null,
    };
    meta.mapping = buildMapping(display?.x ?? 0, display?.y ?? 0, display?.scale ?? null, !!display);
    return meta;
  }

  if (displays.length === 1) {
    const display = displays[0];
    meta.capture = {
      mode: 'display',
      displayId: display.id,
      displayName: display.name,
      region: { x: display.x, y: display.y, w: display.width, h: display.height },
    };
    meta.mapping = buildMapping(display.x, display.y, display.scale || 1, true);
    return meta;
  }

  const bounds = unionBounds(displays);
  const scale = commonScale(displays);
  meta.capture = {
    mode: 'desktop',
    displayCount: displays.length,
    region: bounds,
  };
  meta.mapping = buildMapping(bounds?.x ?? 0, bounds?.y ?? 0, scale, Number.isFinite(scale));
  return meta;
}

function buildSomMetadata(imagePath, display, marksPath) {
  return {
    version: 1,
    source: 'som',
    imagePath,
    capture: {
      mode: 'display',
      displayId: display?.id || null,
      displayName: display?.name || null,
      region: display ? { x: display.x, y: display.y, w: display.width, h: display.height } : null,
      marksPath: marksPath || null,
    },
    mapping: buildMapping(display?.x ?? 0, display?.y ?? 0, display?.scale ?? null, !!display),
  };
}

function writeMetadata(imagePath, data) {
  const target = sidecarPath(imagePath);
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return target;
}

function readMetadata(imagePath) {
  const target = sidecarPath(imagePath);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return { error: 'Metadata sidecar is malformed', path: target };
  }
}

function screenPointForImagePoint(meta, x, y) {
  if (!meta || meta.error) return null;
  const mapping = meta.mapping;
  if (!mapping || !mapping.screenReady || !Number.isFinite(mapping.scale) || mapping.scale <= 0) return null;
  return {
    x: Math.round(mapping.originX + (x / mapping.scale)),
    y: Math.round(mapping.originY + (y / mapping.scale)),
  };
}

module.exports = {
  sidecarPath,
  buildScreenshotMetadata,
  buildSomMetadata,
  writeMetadata,
  readMetadata,
  screenPointForImagePoint,
};
