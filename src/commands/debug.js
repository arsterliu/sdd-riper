var fs = require('fs');
var path = require('path');
var common = require('../../lib/common');

function run(projectDir, opts) {
  var docsRoot = common.getDocsRoot(projectDir);
  if (!fs.existsSync(docsRoot)) { console.error('[ERROR] Not initialized.'); process.exit(1); }
  var latestSpec = common.findLatestSpec(path.join(docsRoot, 'specs'));
  var errorMsg = opts.error || '(not set)';
  var logContent = '(no log file)';
  if (opts.log) {
    var logFile = opts.log;
    if (fs.existsSync(logFile)) {
      try {
        var raw = fs.readFileSync(logFile, 'utf-8');
        var lines = raw.split(/\r?\n/);
        if (lines.length > 100) logContent = lines.slice(0, 100).join('\n') + '\n[TRUNCATED: 100/' + lines.length + ' lines]';
        else logContent = raw;
      } catch (e) { logContent = '(cannot read: ' + logFile + ')'; }
    } else logContent = '(log file not found: ' + logFile + ')';
  }
  var executeLog = '(no Execute Log)';
  if (latestSpec && fs.existsSync(latestSpec)) {
    var logRef = common.getFrontmatterField(latestSpec, 'execute-log-file');
    var logPath = logRef ? common.resolveProjectPath(projectDir, logRef) : '';
    var el = logPath && fs.existsSync(logPath)
      ? common.extractSection(logPath, 'Execute Log', 50)
      : common.extractSection(latestSpec, 'Execute Log', 50);
    if (el) executeLog = el;
  }
  console.log('## DEBUG PROMPT');
  console.log('### Error: ' + errorMsg);
  console.log('### Log (<=100 lines):');
  console.log(logContent);
  console.log('### Execute Log:');
  console.log(executeLog);
  console.log('### AI: Find root cause before proposing fix.');
}
module.exports = run;
