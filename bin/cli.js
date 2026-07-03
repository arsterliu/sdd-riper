#!/usr/bin/env node
var program = require('commander').program;

function normalizeCommandAliases(argv) {
  var out = argv.slice();
  var command = out[2];
  if (command !== 'discover') return out;
  for (var i = 3; i < out.length; i++) {
    if (out[i] === '--version') out[i] = '--spec-version';
  }
  return out;
}

program
  .name('sdd')
  .description('SDD-RIPER: Structured Driven Development')
  .version('2.0.0', '-V, --version')
  .helpOption('-h, --help', 'display help');

program.command('init <project-dir>')
  .description('Initialize SDD-RIPER project structure')
  .option('--mode <mode>', 'standard | lite | micro', 'standard')
  .option('--force', 'overwrite existing files')
  .option('--docs-dir <name>', 'docs directory name', 'mydocs')
  .action(function(p, o) { require('../src/commands/init')(p, o); });

program.command('discover <project-dir>')
  .description('Create a new task Spec')
  .requiredOption('--task-name <name>', 'task name')
  .option('--spec-version <ver>', 'spec version vN.M')
  .option('--requirement <text>', 'requirement')
  .option('--goal <text>', 'goal')
  .option('--constraints <text>', 'constraints')
  .option('--context <text>', 'context')
  .option('--mode <mode>', 'spec mode')
  .addHelpText('after', '\nAlias: --version <ver> is accepted as --spec-version <ver>.')
  .action(function(p, o) { o.version = o.specVersion || o.version; require('../src/commands/discover')(p, o); });

program.command('resume <project-dir>')
  .description('Resume existing task')
  .action(function(p) { require('../src/commands/resume')(p); });

program.command('status <project-dir>')
  .description('Check project health')
  .action(function(p) { require('../src/commands/status')(p); });

program.command('doctor [project-dir]')
  .description('Self-check SDD wiring (vendored/protocols references, INTEGRATIONS touchpoints, install-skill coverage)')
  .action(function(p) { require('../src/commands/doctor')(p); });

program.command('next <project-dir>')
  .description('Analyze current workflow state and next action')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .action(function(p, o) { require('../src/commands/next')(p, o); });

program.command('challenge <project-dir>')
  .description('Generate adversarial review prompt, or record challenge result with --record-result')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--record-result <verdict>', 'record challenge verdict (PASS|PASS_WITH_CONCERNS|FAIL_*) into spec')
  .option('--summary <text>', 'challenge summary (used with --record-result)')
  .option('--executed-by <who>', 'who executed the challenge (subagent|inline, used with --record-result)')
  .action(function(p, o) { require('../src/commands/challenge')(p, o); });

program.command('cruise <project-dir>')
  .description('Generate autonomous cruise prompt')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--engine <engine>', 'auto | prompt | local-loop | claude-code | codex | opencode', 'auto')
  .option('--emit-claude-prompt', 'emit a Claude Code ultracode workflow prompt')
  .option('--record-run', 'append current cruise state to the run ledger')
  .option('--iteration <n>', 'current cruise iteration', '1')
  .action(function(p, o) { require('../src/commands/cruise')(p, o); });

program.command('console [project-dir]')
  .description('Start local read-only Web Console')
  .option('--port <port>', 'port', '4789')
  .option('--host <host>', 'host', '127.0.0.1')
  .action(function(p, o) { require('../src/commands/console')(p, o); });

program.command('install-skill')
  .description('Install bundled SDD-RIPER skill into an agent skill directory')
  .requiredOption('--target <target>', 'codex | cc-switch | claude | opencode | all')
  .option('--clean', 'remove the existing target skill directory before copying')
  .action(function(o) { require('../src/commands/install-skill')(o); });

program.command('validate <project-dir>')
  .description('Validate active Spec gates')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--archive-ready', 'require archive readiness gates')
  .action(function(p, o) { require('../src/commands/validate')(p, o); });

program.command('archive <project-dir> <spec-name>')
  .description('Archive completed Spec')
  .option('--force', 'overwrite')
  .action(function(p, n, o) { require('../src/commands/archive')(p, n, o); });

program.command('reopen <project-dir> <task-slug>')
  .description('Reopen an archived spec as a new patch spec')
  .requiredOption('--defect <text>', 'defect description')
  .option('--mode <mode>', 'patch mode', 'micro')
  .action(function(p, s, o) { require('../src/commands/reopen')(p, s, o); });

program.command('new-learning <project-dir> [spec-name]')
  .description('Create and bind a Learning Record for a spec')
  .option('--force', 'overwrite existing learning record')
  .action(function(p, s, o) { require('../src/commands/new-learning')(p, s, o); });

program.command('review-execute <project-dir>')
  .description('Generate 4-axis Review prompt')
  .option('--spec <path>', 'spec file')
  .option('--diff-base <rev>', 'git diff base')
  .action(function(p, o) { require('../src/commands/review-execute')(p, o); });

program.command('learnings [project-dir]')
  .description('Show project-level learnings, or relevance-ranked recall for a spec (--for)')
  .option('--for <spec>', 'spec path/name to recall relevant learnings for')
  .option('--limit <n>', 'max recall results (default 5)')
  .action(function(p, o) { require('../src/commands/learnings')(p || '.', o); });

program.command('codemap <project-dir>')
  .description('Output a computed architecture view (on-demand, not persisted)')
  .action(function(p) { require('../src/commands/codemap').run(p); });

program.command('debug <project-dir>')
  .description('Generate Debug prompt')
  .option('--log <file>', 'log file')
  .option('--error <msg>', 'error message')
  .action(function(p, o) { require('../src/commands/debug')(p, o); });

program.parse(normalizeCommandAliases(process.argv));
