var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('../commands/validate');
var learning = require('./learning');
var workflow = require('./workflow');
var cruiseRun = require('./cruise-run');
var specCache = new Map();

var PHASES = [
  'research',
  'innovate',
  'design',
  'acceptance',
  'plan',
  'execute',
  'learning',
  'ready',
  'archived'
];

var SECTION = {
  confirmedRequirement: 'Confirmed Requirement',
  innovateOptions: 'Innovate Options',
  technicalDesign: 'Technical Design',
  designNote: 'Design Note',
  acceptanceCriteria: 'Acceptance Criteria',
  plan: 'Plan',
  executeLog: 'Execute Log',
  review: 'Review (Verdict|Summary)',
  intake: 'Intake'
};

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
      !/^[A-Za-z][A-Za-z0-9 /_-]*:\s*$/.test(line) &&
      !/^[-:]+$/.test(line);
  }) || '';
}

function sectionText(filePath, pattern) {
  return common.extractSection(filePath, pattern, 500);
}

function sectionHasContent(filePath, pattern) {
  return !!firstRealLine(sectionText(filePath, pattern));
}

function subsectionHasContent(filePath, pattern) {
  return !common.subsectionIsEmpty(filePath, pattern);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A verdict line counts as PASS only when it carries a PASS token and no FAIL_
// token, so a failing line that merely mentions the word "PASS" is not archived.
function isPassVerdict(line) {
  var s = String(line || '');
  if (/\bFAIL_/i.test(s)) return false;
  return /\bPASS\b|\bPASS_WITH_CONCERNS\b/.test(s);
}

function labelHasContent(section, label) {
  var lines = stripHtmlComments(section).split(/\r?\n/);
  var labelRegex = new RegExp('^' + escapeRegExp(label) + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var m = line.match(labelRegex);
    if (!m) continue;
    if (m[1] && m[1].trim()) return true;
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (!next || next.startsWith('<!--') || next.startsWith('|') || /^#+\s/.test(next)) continue;
      if (/^[A-Za-z][A-Za-z0-9 /_-]*:[ \t]*/.test(next)) break;
      return true;
    }
    continue;
  }
  return false;
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
  var frontmatter = parseFrontmatter(specPath);
  var mode = frontmatter.mode || 'standard';
  var designPattern = mode === 'lite' ? SECTION.designNote : SECTION.technicalDesign;
  var designRef = common.getFrontmatterField(specPath, 'design-file');
  var logRef = common.getFrontmatterField(specPath, 'execute-log-file');
  var learningRef = common.getFrontmatterField(specPath, 'learning-file');
  var designPath = mode === 'micro' || !designRef ? '' : common.resolveProjectPath(projectDir, designRef);
  var logPath = logRef ? common.resolveProjectPath(projectDir, logRef) : '';
  var learningPath = learningRef ? common.resolveProjectPath(projectDir, learningRef) : '';
  return [
    projectDir,
    specPath,
    location,
    lightweight ? 'light' : 'full',
    fileSignature(specPath),
    mode === 'micro' ? 'micro-design' : designPattern + ':' + fileSignature(designPath),
    'log:' + fileSignature(logPath),
    'learning:' + fileSignature(learningPath),
    'cruise:' + fileSignature(cruiseRun.ledgerPath(projectDir, specPath))
  ].join('|');
}

function completionState(projectDir, specPath, mode) {
  var designPattern = mode === 'lite' ? SECTION.designNote : SECTION.technicalDesign;
  var design = mode === 'micro'
    ? { ref: common.getFrontmatterField(specPath, 'design-file'), path: '', relativePath: '', exists: true, hasContent: true, notRequired: true }
    : artifactState(projectDir, specPath, 'design-file', designPattern);
  var executeLog = artifactState(projectDir, specPath, 'execute-log-file', SECTION.executeLog);
  var learningArtifact = learning.learningArtifact(projectDir, specPath);
  var learningContent = learningArtifact.content;
  var plan = sectionText(specPath, SECTION.plan);
  var content = fs.readFileSync(specPath, 'utf-8');
  // Challenge Verdict is the sole quality gate.
  var challengeVerdict = '';
  var cvMatch = content.match(/^[ \t]*Challenge Verdict:[ \t]*(.+)$/m);
  if (cvMatch) challengeVerdict = cvMatch[1].trim().toUpperCase();
  var challengePass = challengeVerdict === 'PASS' || challengeVerdict === 'PASS_WITH_CONCERNS';
  var learningTriggers = learning.learningTriggers(content, executeLog.content || sectionText(executeLog.path || '', SECTION.executeLog), challengeVerdict);
  var learningRequired = learningTriggers.length > 0;
  learningArtifact.hasContent = learningArtifact.exists ? !!learning.firstRealLine(learningContent) : false;
  learningArtifact.required = learningRequired;
  learningArtifact.triggers = learningTriggers;
  delete learningArtifact.content;
  if (!learningRequired && !learningArtifact.ref) learningArtifact.notRequired = true;
  var acceptance = mode === 'micro'
    ? labelHasContent(plan, 'Acceptance') && labelHasContent(plan, 'Verification')
    : sectionHasContent(specPath, SECTION.acceptanceCriteria);
  var research = mode === 'standard'
    ? subsectionHasContent(specPath, SECTION.confirmedRequirement)
    : mode === 'lite'
      ? sectionHasContent(specPath, SECTION.confirmedRequirement)
      : sectionHasContent(specPath, SECTION.intake);
  var innovate = mode === 'micro' ? true : sectionHasContent(specPath, SECTION.innovateOptions);
  var approvedBy = labelHasContent(content, 'Plan Approved By');
  var approvedAt = labelHasContent(content, 'Approved At');
  var autoGate = /^auto-gate$/i.test((content.match(/^[ \t]*Plan Approved By:[ \t]*(.*)$/m) || [])[1] || '');
  var planApproved = approvedBy && approvedAt && (!autoGate || labelHasContent(content, 'Gate Evidence'));
  // completionVerification: check if Execute Log contains a completion-verification step
  var fullLogContent = executeLog.hasContent && executeLog.path && fs.existsSync(executeLog.path)
    ? fs.readFileSync(executeLog.path, 'utf-8')
    : (executeLog.content || '');
  var completionVerification = executeLog.hasContent && /completion.verification|completion-verification/i.test(fullLogContent);
  return {
    research: research,
    innovate: innovate,
    design: design.hasContent,
    acceptance: acceptance,
    plan: planApproved,
    executeLog: executeLog.hasContent,
    completionVerification: completionVerification,
    challengePass: challengePass,
    designArtifact: design,
    executeLogArtifact: executeLog,
    learningArtifact: learningArtifact,
    learningRequired: learningRequired,
    learning: !learningRequired || learningArtifact.hasContent
  };
}

function inferPhase(status, mode, completion) {
  if (status === 'archived') return 'archived';
  if (!completion.research) return 'research';
  if (!completion.innovate) return 'innovate';
  if (mode !== 'micro' && !completion.design) return 'design';
  if (!completion.acceptance) return 'acceptance';
  if (!completion.plan) return 'plan';
  if (!completion.executeLog) return 'execute';
  if (!completion.challengePass) return 'execute';
  if (!completion.learning) return 'learning';
  return 'ready';
}

function parseSpecUncached(projectDir, specPath, location, opts) {
  opts = opts || {};
  var fileName = path.basename(specPath);
  var stat = fs.statSync(specPath);
  var frontmatter = parseFrontmatter(specPath);
  var parsedName = parseFileName(fileName);
  var mode = frontmatter.mode || 'standard';
  var status = frontmatter.status || (location === 'archive' ? 'archived' : 'draft');
  var completion = completionState(projectDir, specPath, mode);
  var phase = inferPhase(status, mode, completion);
  var archiveReady = opts.lightweight
    ? null
    : validate.validateSpec(specPath, { archiveReady: true, projectDir: projectDir });
  var workflowState = opts.lightweight
    ? {
      gatePolicy: common.getGatePolicy(projectDir),
      cruisePolicy: common.getCruisePolicy(projectDir),
      maxIterations: common.getCruiseMaxIterations(projectDir),
      challengeVerdict: '',
      backtrackTarget: '',
      nextAction: ''
    }
    : workflow.analyzeSpec(projectDir, specPath, { validation: archiveReady });
  return {
    id: makeId(projectDir, specPath),
    fileName: fileName,
    relativePath: common.relativeToProject(projectDir, specPath),
    location: location,
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
      research: completion.research,
      innovate: completion.innovate,
      design: completion.design,
      acceptance: completion.acceptance,
      plan: completion.plan,
      executeLog: completion.executeLog,
      completionVerification: completion.completionVerification,
      challengePass: completion.challengePass,
      learning: completion.learning,
      learningRequired: completion.learningRequired
    },
    workflow: workflowState,
    cruiseRun: cruiseRun.readLedger(projectDir, specPath),
    validate: {
      ok: archiveReady ? archiveReady.ok : phase === 'ready',
      issueCount: archiveReady ? archiveReady.issues.length : 0,
      issues: archiveReady ? archiveReady.issues : [],
      lightweight: !!opts.lightweight
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
  var active = listMarkdown(path.join(docsRoot, 'specs')).map(function(file) {
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
