'use strict';

var fs = require('fs');
var path = require('path');
var store = require('../profile/store');

function label(text, name) {
  var match = String(text).match(new RegExp('^' + name + ':\\s*(.*)$', 'mi'));
  return match ? match[1].trim() : '';
}

function frontmatterValue(content, name) {
  var match = String(content || '').match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return '';
  return label(match[1], name).replace(/^['"]|['"]$/g, '');
}

function acceptanceSection(content) {
  var section = String(content || '').split(/^## Acceptance Criteria\s*$/m)[1] || '';
  return section.split(/^## /m)[0].replace(/<!--[\s\S]*?-->/g, '');
}

function parseAcFacts(content) {
  var matches = [];
  var current = null;
  acceptanceSection(content).split(/\r?\n/).forEach(function(line) {
    if (/^### AC-\d+:/i.test(line)) {
      current = [line];
      matches.push(current);
    } else if (current) {
      current.push(line);
    }
  });
  return matches.map(function(lines) {
    var text = lines.join('\n');
    var id = (text.match(/^### (AC-\d+):/i) || [])[1] || '';
    return {
      acId: id.toUpperCase(),
      verification: label(text, 'Verification').toLowerCase(),
      provider: label(text, 'Provider'),
      manualEvidence: label(text, 'Manual Evidence')
    };
  });
}

function diagnostic(code, message, recovery) {
  var value = { code: code, severity: 'blocking', message: message };
  if (recovery) value.recovery = recovery;
  return value;
}

function sourceFor(root, specFile, content) {
  var revision = frontmatterValue(content, 'project-profile-revision');
  var digest = frontmatterValue(content, 'project-profile-digest');
  var units = frontmatterValue(content, 'affected-units').split(',').map(function(value) {
    return value.trim();
  }).filter(Boolean);
  return {
    specPath: path.relative(root, specFile).replace(/\\/g, '/') || '.',
    taskName: frontmatterValue(content, 'task-name'),
    profile: revision && digest ? { revision: revision, digest: digest } : null,
    declaredAffectedUnits: units,
    effectiveAffectedUnits: []
  };
}

function blockedInput(source, acFacts, diagnostics) {
  return {
    source: source,
    profile: null,
    acFacts: acFacts,
    diagnostics: diagnostics,
    blocking: true
  };
}

function withSnapshot(value, file, content) {
  value.specPath = file;
  value.specContent = content;
  return value;
}

function loadQualityInput(projectDir, specPath) {
  var root = fs.realpathSync(path.resolve(projectDir));
  var file = fs.realpathSync(path.resolve(specPath));
  var content = fs.readFileSync(file, 'utf8');
  var source = sourceFor(root, file, content);
  var acFacts = parseAcFacts(content);
  var revision = frontmatterValue(content, 'project-profile-revision');
  var digest = frontmatterValue(content, 'project-profile-digest');
  var unitsText = frontmatterValue(content, 'affected-units');

  if (!revision && !digest && !unitsText) {
    return withSnapshot(blockedInput(source, acFacts, [diagnostic(
      'profile-required',
      'a confirmed exact Project Profile revision is required before quality policy can be projected.',
      'Run the existing Profile detect/review/confirm flow, bind the resulting exact revision to the task, then run quality plan again.'
    )]), file, content);
  }

  if (!revision || !digest || !unitsText) {
    return withSnapshot(blockedInput(source, acFacts, [diagnostic(
      'profile-reference-invalid',
      'project-profile-revision, project-profile-digest, and affected-units must be declared together.'
    )]), file, content);
  }

  try {
    var resolved = store.resolveRevision(root, digest);
    if (resolved.relative !== revision) {
      return withSnapshot(blockedInput(source, acFacts, [diagnostic(
        'profile-reference-invalid',
        'project-profile-revision does not match the exact project-profile-digest.'
      )]), file, content);
    }
    return withSnapshot({
      source: source,
      profile: resolved.revision.profile,
      acFacts: acFacts,
      diagnostics: [],
      blocking: false
    }, file, content);
  } catch (error) {
    return withSnapshot(blockedInput(source, acFacts, [diagnostic(
      'profile-reference-invalid',
      'the exact Project Profile revision cannot be resolved: ' + (error.code || error.message) + '.'
    )]), file, content);
  }
}

module.exports = {
  frontmatterValue: frontmatterValue,
  loadQualityInput: loadQualityInput,
  parseAcFacts: parseAcFacts
};
