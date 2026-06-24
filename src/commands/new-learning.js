var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yamlQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseVersionSlug(fileName) {
  var m = fileName.match(/^(v\d+\.\d+)-(.+)\.md$/);
  return m ? { version: m[1], slug: m[2] } : null;
}

function setFrontmatterField(content, field, value) {
  var line = field + ': "' + yamlQuote(value) + '"';
  var regex = new RegExp('^' + field + ':.*$', 'm');
  if (regex.test(content)) return content.replace(regex, line);
  var first = content.indexOf('---');
  var second = first === 0 ? content.indexOf('\n---', 3) : -1;
  if (second === -1) return content;
  return content.slice(0, second) + '\n' + line + content.slice(second);
}

function fillTemplate(templatePath, taskName, sourceSpecRel) {
  var content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replace(/date: YYYY-MM-DD/, 'date: ' + todayIso());
  content = content.replace(/task-name: "Task Name Placeholder"/g, 'task-name: "' + yamlQuote(taskName) + '"');
  content = content.replace(/^source-spec:.*/m, 'source-spec: "' + yamlQuote(sourceSpecRel) + '"');
  return content;
}

function resolveSpec(projectDir, docsRoot, specName) {
  var specsDir = path.join(docsRoot, 'specs');
  if (specName) {
    var found = common.findSourceSpec(specsDir, common.normalizeSlug(specName));
    if (found) return found;
    var explicit = path.resolve(projectDir, specName);
    if (fs.existsSync(explicit)) return explicit;
    return '';
  }
  return common.findLatestSpec(specsDir);
}

function run(projectDir, specName, opts) {
  opts = opts || {};
  var docsRoot = common.getDocsRoot(projectDir);
  if (!fs.existsSync(docsRoot)) {
    console.error('[ERROR] Project not initialized. Run: sdd init <dir>');
    process.exit(1);
  }
  var specPath = resolveSpec(projectDir, docsRoot, specName);
  if (!specPath || !fs.existsSync(specPath)) {
    console.error('[ERROR] Spec not found.');
    process.exit(1);
  }
  var parsed = parseVersionSlug(path.basename(specPath));
  if (!parsed) {
    console.error('[ERROR] Invalid versioned spec filename.');
    process.exit(1);
  }
  var learningDir = path.join(docsRoot, 'learnings');
  if (!fs.existsSync(learningDir)) fs.mkdirSync(learningDir, { recursive: true });
  var learningPath = path.join(learningDir, parsed.version + '-' + parsed.slug + '.learning.md');
  if (fs.existsSync(learningPath) && !opts.force) {
    console.error('[ERROR] Learning Record already exists. Use --force.');
    process.exit(1);
  }
  var specRel = common.relativeToProject(projectDir, specPath);
  var learningRel = common.relativeToProject(projectDir, learningPath);
  var taskName = common.getFrontmatterField(specPath, 'task-name') || parsed.slug;
  var templatePath = path.join(common.SCAFFOLD_ROOT, 'templates', 'learning.md');
  fs.writeFileSync(learningPath, fillTemplate(templatePath, taskName, specRel), 'utf-8');

  var specContent = fs.readFileSync(specPath, 'utf-8');
  fs.writeFileSync(specPath, setFrontmatterField(specContent, 'learning-file', learningRel), 'utf-8');

  console.log('[LEARNING] ' + learningPath);
  console.log('[SPEC]     ' + specPath);
}

module.exports = run;
