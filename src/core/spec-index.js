var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('../commands/validate');
var learning = require('./learning');
var workflow = require('./workflow');
var specState = require('./spec-state');
var workflowPolicy = require('./workflow-policy');
var cruiseRun = require('./cruise-run');
var specCache = new Map();

var PHASES = [
  'research',
  'innovate',
  'design',
  'acceptance',
  'plan',
  'execute',
  'challenge',
  'learning',
  'archive_authorization',
  'archived'
];

var SECTION = { executeLog: 'Execute Log' };

function stripHtmlComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

function firstRealLine(text) {
  return stripHtmlComments(text).split(/\r?\n/).map(function(line) {
    return line.trim();
  }).find(function(line) {
    return line &&
      !line.startsWith('|') &&
      !/^#+\s/.test(line) &&
      !/^[A-Za-z][A-Za-z0-9 /&_-]*:\s*$/.test(line) &&
      !/^[-:]+$/.test(line);
  }) || '';
}

function sectionText(filePath, pattern) {
  return common.extractSection(filePath, pattern, 500);
}

function sectionHasContent(filePath, pattern) {
  return !!firstRealLine(sectionText(filePath, pattern));
}

function parseFrontmatter(filePath) {
  var result = {};
  if (!fs.existsSync(filePath)) return result;
  var content = fs.readFileSync(filePath, 'utf-8');
  var lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return result;
  for (var i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    var m = lines[i].match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    result[m[1].trim()] = m[2].replace(/#.*$/, '').replace(/^"/, '').replace(/"$/, '').trim();
  }
  return result;
}

function parseFileName(fileName) {
  return common.parseSpecFileName(fileName) || { version: '', slug: fileName.replace(/\.md$/, '') };
}

function makeId(projectDir, filePath) {
  var rel = common.relativeToProject(projectDir, filePath);
  return Buffer.from(rel, 'utf-8').toString('base64url');
}

function pathFromId(projectDir, id) {
  try {
    var rel = Buffer.from(id, 'base64url').toString('utf-8');
    var resolved = path.resolve(projectDir, rel);
    var root = path.resolve(projectDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return '';
    return resolved;
  } catch (e) {
    return '';
  }
}

function artifactState(projectDir, specPath, field, pattern) {
  var ref = common.getFrontmatterField(specPath, field);
  var artifactPath = ref ? common.resolveProjectPath(projectDir, ref) : '';
  var exists = !!artifactPath && fs.existsSync(artifactPath);
  return {
    ref: ref,
    path: artifactPath,
    relativePath: artifactPath ? common.relativeToProject(projectDir, artifactPath) : '',
    exists: exists,
    hasContent: exists ? sectionHasContent(artifactPath, pattern) : false
  };
}

function fileSignature(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 'missing';
  var stat = fs.statSync(filePath);
  return stat.mtimeMs + ':' + stat.size;
}

function cacheKey(projectDir, specPath, location, lightweight) {
  var signatures = ['design-file', 'execute-log-file', 'learning-file'].map(function(field) {
    var ref = common.getFrontmatterField(specPath, field);
    return field + ':' + fileSignature(ref ? common.resolveProjectPath(projectDir, ref) : '');
  });
  return [projectDir, specPath, location, lightweight ? 'light' : 'full', fileSignature(specPath)]
    .concat(signatures, 'cruise:' + fileSignature(cruiseRun.ledgerPath(projectDir, specPath))).join('|');
}

function completionState(projectDir, specPath, mode, historical) {
  var content = fs.readFileSync(specPath, 'utf-8');
  var policy = !historical && !workflowPolicy.formatIssue(content) ? workflowPolicy.evaluate(content, mode) : null;
  var design = artifactState(projectDir, specPath, 'design-file', 'Design');
  var executeLog = artifactState(projectDir, specPath, 'execute-log-file', SECTION.executeLog);
  var learningArtifact = learning.learningArtifact(projectDir, specPath);
  var learningContent = learningArtifact.content;
  var triggers = historical || !policy ? [] : learning.learningTriggers(content,
    sectionText(executeLog.path || '', SECTION.executeLog), specState.challengeFacts(content).verdict);
  var required = triggers.length > 0;
  learningArtifact.hasContent = learningArtifact.exists ? !!learning.firstRealLine(learningContent) : false;
  learningArtifact.required = required;
  learningArtifact.triggers = triggers;
  delete learningArtifact.content;
  if (historical) {
    [design, executeLog].forEach(function(artifact) {
      artifact.hasContent = artifact.exists && !!fs.readFileSync(artifact.path, 'utf8').trim();
    });
  } else if (policy) {
    if (!policy.requiresDesign) design.notRequired = true;
    if (!policy.requiresLog) executeLog.notRequired = true;
    if (!required && !learningArtifact.ref) learningArtifact.notRequired = true;
  }
  return {
    research: false, innovate: false, design: !!(policy && !policy.requiresDesign), acceptance: false,
    plan: false, executeLog: false, completionVerification: false, challengePass: false,
    designArtifact: design, executeLogArtifact: executeLog, learningArtifact: learningArtifact,
    learningRequired: required, learning: !historical && !!policy && (!required || learningArtifact.hasContent)
  };
}

function inferPhase(status, mode, completion) {
  if (status === 'archived') return 'archived';
  return completion && completion.phase || 'research';
}

function parseSpecUncached(projectDir, specPath, location, opts) {
  opts = opts || {};
  var fileName = path.basename(specPath);
  var stat = fs.statSync(specPath);
  var frontmatter = parseFrontmatter(specPath);
  var parsedName = parseFileName(fileName);
  var mode = frontmatter.mode || 'standard';
  var status = frontmatter.status || (location === 'archive' ? 'archived' : 'draft');
  var legacy = location === 'archive';
  var completion = completionState(projectDir, specPath, mode, legacy);
  var phase = inferPhase(status, mode, completion);
  var archiveReady = legacy || opts.lightweight
    ? null
    : validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });
  var workflowState = legacy
    ? {
      autonomyMode: '',
      autonomyModeSource: 'legacy_archive',
      authorizationState: 'historical',
      stopReason: '',
      maxIterations: 0,
      challengeVerdict: '',
      backtrackTarget: '',
      nextAction: 'legacy_archive',
      phase: 'archived',
      completionReady: false,
      blockers: []
    }
    : workflow.analyzeSpec(projectDir, specPath, { validation: archiveReady || { issues: [] } });
  if (!legacy && workflowState.phase) phase = workflowState.phase;
  function gatePassed(gate) {
    return !!(workflowState.gates && workflowState.gates[gate] && workflowState.gates[gate].state === 'pass');
  }
  var authoritativeCompletion = !legacy && workflowState.gates ? {
    research: gatePassed('research'),
    innovate: gatePassed('innovate'),
    design: completion.designArtifact.notRequired || gatePassed('design'),
    acceptance: gatePassed('acceptance'),
    plan: gatePassed('plan'),
    executeLog: gatePassed('execute'),
    completionVerification: gatePassed('completion'),
    challengePass: gatePassed('challenge'),
    learning: gatePassed('learning'),
    learningRequired: !!(workflowState.facts && workflowState.facts.learningRequired)
  } : completion;
  return {
    id: makeId(projectDir, specPath),
    fileName: fileName,
    relativePath: common.relativeToProject(projectDir, specPath),
    location: location,
    legacy: legacy,
    version: parsedName.version,
    slug: parsedName.slug,
    taskName: frontmatter['task-name'] || parsedName.slug,
    mode: mode,
    status: status,
    phase: phase,
    updatedAt: stat.mtime.toISOString(),
    frontmatter: frontmatter,
    artifacts: {
      design: completion.designArtifact,
      executeLog: completion.executeLogArtifact,
      learning: completion.learningArtifact
    },
    completion: {
      research: authoritativeCompletion.research,
      innovate: authoritativeCompletion.innovate,
      design: authoritativeCompletion.design,
      acceptance: authoritativeCompletion.acceptance,
      plan: authoritativeCompletion.plan,
      executeLog: authoritativeCompletion.executeLog,
      completionVerification: authoritativeCompletion.completionVerification,
      challengePass: authoritativeCompletion.challengePass,
      learning: authoritativeCompletion.learning,
      learningRequired: authoritativeCompletion.learningRequired
    },
    workflow: workflowState,
    cruiseRun: cruiseRun.readLedger(projectDir, specPath),
    validate: {
      ok: legacy ? null : (archiveReady ? archiveReady.ok : phase === 'archive_authorization'),
      issueCount: archiveReady ? archiveReady.issues.length : 0,
      issues: archiveReady ? archiveReady.issues : [],
      lightweight: !!opts.lightweight,
      legacy: legacy
    }
  };
}

function parseSpec(projectDir, specPath, location, opts) {
  opts = opts || {};
  var key = cacheKey(projectDir, specPath, location, !!opts.lightweight);
  var cached = specCache.get(key);
  if (cached) return cached;
  var parsed = parseSpecUncached(projectDir, specPath, location, opts);
  specCache.set(key, parsed);
  return parsed;
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function(file) { return file.endsWith('.md') && file !== '.gitkeep'; })
    .sort()
    .map(function(file) { return path.join(dir, file); });
}

function listSpecs(projectDir, opts) {
  opts = opts || {};
  var docsRoot = common.getDocsRoot(projectDir);
  var active = listMarkdown(path.join(docsRoot, 'specs')).filter(function(file) {
    return !/\.design\.md$|\.execute\.md$|\.learning\.md$/.test(file);
  }).map(function(file) {
    return parseSpec(projectDir, file, 'active', opts);
  });
  var archived = listMarkdown(path.join(docsRoot, 'archive')).filter(function(file) {
    return !/\.design\.md$|\.execute\.md$|\.learning\.md$/.test(file);
  }).map(function(file) {
    return parseSpec(projectDir, file, 'archive', opts);
  });
  var specs = active.concat(archived).sort(function(a, b) {
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  var counts = PHASES.reduce(function(acc, phase) {
    acc[phase] = 0;
    return acc;
  }, {});
  specs.forEach(function(spec) { counts[spec.phase] = (counts[spec.phase] || 0) + 1; });
  return {
    projectDir: projectDir,
    docsDir: common.getDocsDir(projectDir),
    docsRoot: docsRoot,
    specs: specs,
    counts: counts
  };
}

function getSpec(projectDir, id, opts) {
  opts = opts || {};
  var specPath = pathFromId(projectDir, id);
  if (!specPath || !fs.existsSync(specPath)) return null;
  var docsRoot = common.getDocsRoot(projectDir);
  var archiveDir = path.join(docsRoot, 'archive');
  var location = path.resolve(specPath).startsWith(path.resolve(archiveDir) + path.sep) ? 'archive' : 'active';
  return parseSpec(projectDir, specPath, location, opts);
}

function validateSpec(projectDir, id) {
  var spec = getSpec(projectDir, id);
  if (!spec) return { ok: false, issues: ['Spec file not found.'], specPath: '' };
  return validate.validateSpec(path.join(projectDir, spec.relativePath), { archiveReady: true, projectDir: projectDir });
}

module.exports = {
  listSpecs: listSpecs,
  getSpec: getSpec,
  validateSpec: validateSpec,
  inferPhase: inferPhase,
  firstRealLine: firstRealLine,
  clearCache: function() { specCache.clear(); }
};
