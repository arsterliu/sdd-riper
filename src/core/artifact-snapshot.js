var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var common = require('../../lib/common');
var autonomyState = require('./autonomy-state');
var labelFacts = require('./label-facts');

var gitRepoCache = new Map();

function isInsideGitRepo(projectDir) {
  var key = path.resolve(projectDir);
  if (gitRepoCache.has(key)) return gitRepoCache.get(key);
  var result = false;
  try {
    result = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim() === 'true';
  } catch (e) {}
  gitRepoCache.set(key, result);
  return result;
}

var labelValue = labelFacts.labelValue;

function referencedArtifact(projectDir, specPath, field) {
  var ref = common.getFrontmatterField(specPath, field);
  var artifactPath = ref ? common.resolveProjectPath(projectDir, ref) : '';
  var exists = !!artifactPath && fs.existsSync(artifactPath);
  return {
    ref: ref,
    path: artifactPath,
    exists: exists,
    content: exists ? fs.readFileSync(artifactPath, 'utf-8') : ''
  };
}

function specLocation(projectDir, specPath) {
  var resolved = path.resolve(specPath);
  var docsRoot = common.getDocsRoot(projectDir);
  var archiveDir = path.resolve(docsRoot, 'archive');
  var specsDir = path.resolve(docsRoot, 'specs');
  var archiveRelative = path.relative(archiveDir, resolved);
  if (archiveRelative && !archiveRelative.startsWith('..' + path.sep) && archiveRelative !== '..' && !path.isAbsolute(archiveRelative)) return 'archive';
  var activeRelative = path.relative(specsDir, resolved);
  if (activeRelative && !activeRelative.startsWith('..' + path.sep) && activeRelative !== '..' && !path.isAbsolute(activeRelative)) return 'active';
  return 'external';
}

function read(projectDir, specPath) {
  if (!specPath || !fs.existsSync(specPath)) {
    return {
      projectDir: projectDir,
      specPath: specPath || '',
      exists: false,
      isGitRepo: false,
      location: 'external',
      content: '',
      mode: 'standard',
      status: 'draft',
      design: { ref: '', path: '', exists: false, content: '' },
      executeLog: { ref: '', path: '', exists: false, content: '' },
      learning: { ref: '', path: '', exists: false, content: '' }
    };
  }
  var content = fs.readFileSync(specPath, 'utf-8');
  var autonomy = autonomyState.resolve(content);
  return {
    projectDir: projectDir,
    specPath: specPath,
    exists: true,
    isGitRepo: isInsideGitRepo(projectDir),
    location: specLocation(projectDir, specPath),
    content: content,
    mode: common.getFrontmatterField(specPath, 'mode') || 'standard',
    status: common.getFrontmatterField(specPath, 'status') || 'draft',
    autonomyMode: autonomy.mode,
    autonomyModeSource: autonomy.modeSource,
    autonomy: autonomy,
    design: referencedArtifact(projectDir, specPath, 'design-file'),
    executeLog: referencedArtifact(projectDir, specPath, 'execute-log-file'),
    learning: referencedArtifact(projectDir, specPath, 'learning-file')
  };
}

module.exports = {
  read: read,
  isInsideGitRepo: isInsideGitRepo,
  labelValue: labelValue
};
