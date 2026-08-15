const fs = require('fs');
const path = require('path');
const aiConfigRules = require('../core/ai-config-rules');
const governanceContract = require('../core/governance-contract');

var BLOCK_START = '<!-- sdd-riper:start -->';
var BLOCK_END = '<!-- sdd-riper:end -->';

function sddBlock(title, mode, bodyLines) {
  return [
    BLOCK_START,
    '## ' + title,
    '',
    aiConfigRules.INTRO_LINE,
    '',
    'Hard rules:'
  ].concat(aiConfigRules.CORE_RULES)
   .concat(['', 'Capability routing:'])
   .concat(aiConfigRules.CAPABILITY_ROUTING)
   .concat(['', 'Entry points:'])
   .concat(aiConfigRules.ENTRY_POINTS)
   .concat(['', 'Project configuration:'])
   .concat(aiConfigRules.PROJECT_CONFIG)
   .concat(['- Mode: ' + mode, ''])
   .concat(bodyLines || [])
   .concat([BLOCK_END]).join('\n');
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : text + '\n';
}

function markerOffsets(text, marker) {
  var offsets = [];
  var offset = text.indexOf(marker);
  while (offset !== -1) {
    offsets.push(offset);
    offset = text.indexOf(marker, offset + marker.length);
  }
  return offsets;
}

function lastGeneratedManagedBlock(existing, starts, ends, block) {
  var candidate = null;
  starts.forEach(function(start) {
    var end = ends.find(function(offset) { return offset > start; });
    var nextStart = starts.find(function(offset) { return offset > start; });
    if (end === undefined || (nextStart !== undefined && nextStart < end)) return;

    var content = existing.slice(start, end + BLOCK_END.length);
    if (content !== block) return;
    candidate = { start: start, end: end + BLOCK_END.length };
  });
  return candidate;
}

function upsertManagedBlock(existing, block) {
  var starts = markerOffsets(existing, BLOCK_START);
  var ends = markerOffsets(existing, BLOCK_END);
  if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
    var start = starts[0];
    var end = ends[0] + BLOCK_END.length;
    return {
      content: existing.slice(0, start) + block + existing.slice(end),
      action: 'update'
    };
  }
  if (starts.length !== 0 || ends.length !== 0) {
    var previous = lastGeneratedManagedBlock(existing, starts, ends, block);
    if (previous) {
      return {
        content: existing.slice(0, previous.start) + block + existing.slice(previous.end),
        action: 'update'
      };
    }
    return {
      content: ensureTrailingNewline(existing) + '\n' + block + '\n',
      action: 'merge'
    };
  }
  var prefix = ensureTrailingNewline(existing);
  return {
    content: prefix + '\n' + block + '\n',
    action: 'merge'
  };
}

function run(projectDir, mode, force) {
  if (!mode) mode = governanceContract.defaults.mode;
  if (['standard','lite','micro'].indexOf(mode) === -1) {
    console.error('[ERROR] Invalid mode: ' + mode + ' (expected standard|lite|micro)');
    process.exit(3);
  }

  var created = 0, skipped = 0;

  function writeConfig(dst, block) {
    var dir = path.dirname(dst);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dst)) {
      fs.writeFileSync(dst, block + '\n', 'utf-8');
      console.log('[CREATE] ' + dst);
      created++;
      return;
    }

    var existing = fs.readFileSync(dst, 'utf-8');
    var result = upsertManagedBlock(existing, block);
    if (result.content === existing) {
      console.log('[SKIP] ' + dst + ' SDD-RIPER block already current');
      skipped++;
      return;
    }
    fs.writeFileSync(dst, result.content, 'utf-8');
    console.log('[' + result.action.toUpperCase() + '] ' + dst + (result.action === 'merge' ? ' appended SDD-RIPER block' : ' refreshed SDD-RIPER block'));
    created++;
  }

  [
    { file: 'AGENTS.md', title: 'SDD-RIPER Agent Instructions', suffix: aiConfigRules.SUFFIXES.agents },
    { file: 'CLAUDE.md', title: 'Claude Project Instructions - SDD-RIPER', suffix: aiConfigRules.SUFFIXES.claude },
    { file: '.cursorrules', title: 'SDD-RIPER Cursor Rules', suffix: aiConfigRules.SUFFIXES.cursor },
    { file: path.join('.github', 'copilot-instructions.md'), title: 'GitHub Copilot Instructions - SDD-RIPER', suffix: aiConfigRules.SUFFIXES.copilot }
  ].forEach(function(target) {
    writeConfig(path.join(projectDir, target.file), sddBlock(target.title, mode, target.suffix));
  });

  return { created: created, skipped: skipped };
}

module.exports = { run: run };
