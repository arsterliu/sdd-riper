var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');
var validate = require('./validate');
var labelValue = require('../core/artifact-snapshot').labelValue;

function firstMeaningfulLine(content) {
  return String(content || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).map(function(line) {
    return line.trim();
  }).find(function(line) {
    return line && !/^#+\s/.test(line) && !/^[-:]+$/.test(line);
  }) || '';
}

function sectionFromContent(content, heading) {
  var escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var match = String(content || '').match(new RegExp('^## ' + escaped + '\\s*\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm'));
  return match ? match[1] : '';
}

function buildArchiveSummary(sourceContent, designContent, learningContent, dateIso) {
  var goal = firstMeaningfulLine(sectionFromContent(sourceContent, 'Summary')) || labelValue(sourceContent, 'requirement');
  var selected = labelValue(designContent, 'Selected Option / ADR') || labelValue(sourceContent, 'Selected Option') || labelValue(sourceContent, 'Selected');
  var constraints = labelValue(sourceContent, 'Dependencies & Constraints') || labelValue(sourceContent, 'constraints') || '无额外约束。';
  var risks = labelValue(designContent, 'Risks / Trade-offs') || labelValue(learningContent, 'Decision Rule') || labelValue(sourceContent, 'Challenge Summary');
  if (!goal || !selected || !constraints || !risks) return '';
  return [
    '',
    '---',
    '<!-- Archive summary on ' + dateIso + ' -->',
    '',
    '## 目标摘要',
    goal,
    '',
    '## 最终方案',
    selected,
    '',
    '## 关键约束',
    constraints,
    '',
    '## 坑点与风险',
    risks,
    ''
  ].join('\n');
}

function prepareArchiveArtifact(projectDir, archiveDir, archiveSpecRel, sourceSpec, field, force) {
  var ref = common.getFrontmatterField(sourceSpec, field);
  if (!ref) return null;
  var src = common.resolveProjectPath(projectDir, ref);
  if (!fs.existsSync(src)) return null;
  var dst = path.join(archiveDir, path.basename(src));
  if (fs.existsSync(dst) && !force) {
    console.error('[ERROR] Archive artifact already exists: ' + dst + '. Use --force.');
    process.exit(1);
  }
  var content = fs.readFileSync(src, 'utf-8');
  content = content.replace(/^status:[ \t]*[^\s#]*/m, 'status: archived');
  content = content.replace(/^source-spec:.*/m, 'source-spec: "' + archiveSpecRel + '"');
  return {
    field: field,
    src: src,
    dst: dst,
    rel: common.relativeToProject(projectDir, dst),
    content: content
  };
}

function archiveAuthorization(opts) {
  opts = opts || {};
  var authorizedBy = String(opts.authorizedBy || '').trim();
  var evidence = String(opts.authorizationEvidence || '').trim();
  if (!authorizedBy || !evidence) {
    console.error('[ERROR] SDD_ARCHIVE_AUTHORIZATION_REQUIRED: archive requires --authorized-by "human:<name>" and --authorization-evidence "<single-line-text>" from the current user.');
    process.exit(2);
  }
  if (!/^human:[^:\s]+$/i.test(authorizedBy) || /[\x00-\x1f\x7f]/.test(evidence)) {
    console.error('[ERROR] SDD_ARCHIVE_AUTHORIZATION_INVALID: authorized-by must be human:<name> and authorization evidence must be non-empty single-line text without control characters.');
    process.exit(2);
  }
  return {
    authorizedBy: authorizedBy,
    authorizedAt: new Date().toISOString(),
    evidence: evidence
  };
}

function run(projectDir, specName, opts) {
  var authorization = archiveAuthorization(opts);
  var docsRoot = common.getDocsRoot(projectDir);
  var specsDir = path.join(docsRoot, 'specs');
  var archiveDir = path.join(docsRoot, 'archive');
  var force = !!opts.force;
  if (!fs.existsSync(specsDir)) { console.error('[ERROR] ' + specsDir + ' not found.'); process.exit(1); }
  var specSlug = common.normalizeSlug(specName);
  var sourceSpec = common.findSourceSpecByRef(specsDir, specName);
  if (!sourceSpec) {
    console.error('[ERROR] No versioned spec matching ' + specSlug + ' found.');
    process.exit(1);
  }
  var validation = validate.validateSpec(sourceSpec, { archiveReady: true, projectDir: projectDir });
  if (!validation.workflowState || !validation.workflowState.completionReady) {
    console.error('[ERROR] Spec is not archive-ready. Run: sdd validate "' + projectDir + '" --spec "' + sourceSpec + '" --archive-ready');
    validation.issues.forEach(function(issue) { console.error('  - ' + issue); });
    process.exit(1);
  }
  var sourceBname = path.basename(sourceSpec);
  var specVersion = 'v1.0';
  var parsed = common.parseSpecFileName(sourceBname);
  if (parsed) {
    specVersion = parsed.version;
    specSlug = parsed.slug;
  }
  var archiveFile = path.join(archiveDir, specVersion + '-' + specSlug + '.md');
  if (fs.existsSync(archiveFile) && !force) { console.error('[ERROR] Archive already exists. Use --force.'); process.exit(1); }
  var dateIso = new Date().toISOString().slice(0, 10);
  var archiveSpecRel = common.relativeToProject(projectDir, archiveFile);
  var designArtifact = prepareArchiveArtifact(projectDir, archiveDir, archiveSpecRel, sourceSpec, 'design-file', force);
  var logArtifact = prepareArchiveArtifact(projectDir, archiveDir, archiveSpecRel, sourceSpec, 'execute-log-file', force);
  var learningArtifact = prepareArchiveArtifact(projectDir, archiveDir, archiveSpecRel, sourceSpec, 'learning-file', force);
  var sourceContent = fs.readFileSync(sourceSpec, 'utf-8');
  sourceContent = sourceContent.replace(/^status:[ \t]*[^\s#]*/m, 'status: archived');
  [designArtifact, logArtifact, learningArtifact].forEach(function(artifact) {
    if (!artifact) return;
    var escaped = artifact.rel.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var replacement = artifact.field + ': "' + escaped + '"';
    sourceContent = sourceContent.replace(new RegExp('^' + artifact.field + ':.*', 'gm'), replacement);
  });
  sourceContent += [
    '',
    '## Archive Authorization',
    '',
    'Archive Authorized By: ' + authorization.authorizedBy,
    'Archive Authorized At: ' + authorization.authorizedAt,
    'Archive Authorization Evidence: ' + authorization.evidence,
    ''
  ].join('\n');
  var summary = buildArchiveSummary(
    sourceContent,
    designArtifact ? designArtifact.content : '',
    learningArtifact ? learningArtifact.content : '',
    dateIso
  );
  if (!summary) {
    console.error('[ERROR] Archive summary could not be generated from Summary/Requirement, Selected Option / ADR, constraints, and risks/challenge evidence.');
    process.exit(1);
  }
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(archiveFile, sourceContent + summary, 'utf-8');
  [designArtifact, logArtifact, learningArtifact].forEach(function(artifact) {
    if (!artifact) return;
    fs.writeFileSync(artifact.dst, artifact.content, 'utf-8');
    if (path.resolve(artifact.src) !== path.resolve(artifact.dst)) fs.unlinkSync(artifact.src);
  });
  fs.unlinkSync(sourceSpec);
  var indexFile = path.join(archiveDir, 'index.md');
  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, '# Archive Index\n| File | Date | Task | Verdict |\n|---|---|---|---|\n');
  }
  var taskNameVal = common.getFrontmatterField(archiveFile, 'task-name') || specSlug;
  var verdictVal = '—';
  try {
    var archivedContent = fs.readFileSync(archiveFile, 'utf-8');
    var challengeVerdict = labelValue(archivedContent, 'Challenge Verdict');
    if (challengeVerdict) {
      verdictVal = challengeVerdict;
    } else {
      var vc = common.extractSection(archiveFile, 'Review (Verdict|Summary)', 5);
      if (vc) { var vlines = vc.split(/\r?\n/); for (var i = 0; i < vlines.length; i++) { var t = vlines[i].trim(); if (t && !t.startsWith('<!--')) { verdictVal = t; break; } } }
    }
  } catch (e) {}
  fs.appendFileSync(indexFile, '| ' + path.basename(archiveFile) + ' | ' + dateIso + ' | ' + taskNameVal + ' | ' + verdictVal + ' |\n');
  console.log('[ARCHIVE] ' + archiveFile);
  if (designArtifact) console.log('[DESIGN]  ' + designArtifact.dst);
  if (logArtifact) console.log('[LOG]     ' + logArtifact.dst);
  if (learningArtifact) console.log('[LEARNING] ' + learningArtifact.dst);
  console.log('[INDEX]   ' + indexFile);
  console.log('[MOVED] ' + sourceBname + ' -> archive/' + path.basename(archiveFile));
}
module.exports = run;
