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
  .option('--mode <mode>', 'standard | lite | micro', 'micro')
  .option('--force', 'overwrite existing files')
  .option('--docs-dir <name>', 'docs directory name', 'mydocs')
  .option('--autonomy-mode <mode>', 'auto | supervised | human')
  .action(function(p, o) { require('../src/commands/init')(p, o); });

program.command('discover <project-dir>')
  .description('Create a new task Spec')
  .requiredOption('--task-name <name>', 'task name')
  .option('--spec-version <ver>', 'spec version vN.M or vN.M.P')
  .option('--requirement <text>', 'requirement')
  .option('--goal <text>', 'goal')
  .option('--constraints <text>', 'constraints')
  .option('--context <text>', 'context')
  .option('--unit <ids...>', 'affected workspace unit ids (or project)')
  .option('--mode <mode>', 'spec mode')
  .option('--autonomy-mode <mode>', 'auto | supervised | human')
  .addHelpText('after', '\nAlias: --version <ver> is accepted as --spec-version <ver>.')
  .action(function(p, o) { o.version = o.specVersion || o.version; require('../src/commands/discover')(p, o); });

var autonomy = program.command('autonomy').description('Inspect and manage task autonomy policy');
autonomy.command('inspect <project-dir>')
  .option('--spec <path>', 'active spec file')
  .action(function(p, o) { require('../src/commands/autonomy').inspect(p, o); });
autonomy.command('migrate <project-dir>')
  .requiredOption('--mode <mode>', 'auto | supervised | human')
  .action(function(p, o) { require('../src/commands/autonomy').migrate(p, o); });
autonomy.command('select <project-dir>')
    .requiredOption('--spec <path>', 'active spec file')
    .requiredOption('--mode <mode>', 'auto | supervised | human')
    .option('--expected-scope-digest <digest>', 'confirmed scope digest')
    .option('--authorized-by <identity>', 'human:<name>')
    .option('--authorization-evidence <text>', 'single-line current-user evidence')
  .action(function(p, o) { require('../src/commands/autonomy').select(p, o); });
autonomy.command('authorize <project-dir>')
  .requiredOption('--spec <path>', 'active spec file')
  .option('--expected-scope-digest <digest>', 'confirmed scope digest')
  .option('--expected-plan-digest <digest>', 'confirmed Plan digest (required for supervised)')
  .option('--authorized-by <identity>', 'human:<name>')
  .option('--authorization-evidence <text>', 'single-line current-user evidence')
  .action(function(p, o) { require('../src/commands/autonomy').authorize(p, o); });
autonomy.command('activate-plan <project-dir>')
  .requiredOption('--spec <path>', 'active spec file')
  .option('--expected-scope-digest <digest>', 'current scope digest')
  .option('--expected-risk-snapshot <digest>', 'current risk snapshot')
  .option('--expected-plan-digest <digest>', 'current Plan digest')
  .option('--activated-by <identity>', 'agent:<id>')
  .option('--evidence <text>', 'single-line activation evidence')
  .action(function(p, o) { require('../src/commands/autonomy').activatePlan(p, o); });
autonomy.command('approve-gate <project-dir>')
  .requiredOption('--spec <path>', 'active spec file')
  .requiredOption('--gate <gate>', 'Research | Innovate | Plan | Completion | Challenge | Repair')
  .option('--expected-digest <digest>', 'confirmed gate digest')
  .option('--authorized-by <identity>', 'human:<name>')
  .option('--authorization-evidence <text>', 'single-line current-user evidence')
  .action(function(p, o) { require('../src/commands/autonomy').approveGate(p, o); });

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

var visual = program.command('visual').description('Manage task visual evidence contracts');
visual.command('init <project-dir>')
  .description('Create and bind a visual evidence contract for an active Spec')
  .requiredOption('--spec <path>', 'active spec file')
  .requiredOption('--mode <mode>', 'fidelity | direction')
  .action(function(p, o) { require('../src/commands/visual').runInit(p, o); });
visual.command('inspect <project-dir>')
  .description('Inspect a visual evidence contract without writing files')
  .requiredOption('--spec <path>', 'active spec file')
  .action(function(p, o) { require('../src/commands/visual').inspect(p, o); });
visual.command('discover <project-dir>')
  .description('Discover local visual Context materials without writing files')
  .requiredOption('--spec <path>', 'active spec file')
  .action(function(p, o) { require('../src/commands/visual').runDiscover(p, o); });
visual.command('select <project-dir>')
  .description('Record the one-time visual context intent for an active Spec')
  .requiredOption('--spec <path>', 'active spec file')
  .requiredOption('--ui-impact <value>', 'yes | no')
  .option('--intent <intent>', 'not-required | direction | fidelity')
  .action(function(p, o) { require('../src/commands/visual').runSelect(p, o); });

program.command('challenge <project-dir>')
  .description('Generate adversarial review prompt, or record challenge result with --record-result')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--record-result <verdict>', 'record challenge verdict (PASS|PASS_WITH_CONCERNS|FAIL_*) into spec')
  .option('--summary <text>', 'challenge summary (used with --record-result)')
  .option('--executed-by <who>', 'who executed the challenge (subagent:<id>|external-agent:<id>|human:<name>|inline, used with --record-result)')
  .action(function(p, o) { require('../src/commands/challenge')(p, o); });

program.command('cruise <project-dir>')
  .description('Generate autonomous cruise prompt')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--driver <driver>', 'auto | prompt | local-loop | claude-code | codex | opencode')
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
  .option('--check', 'compare bundled and installed skill content without modifying the target')
  .action(function(o) { require('../src/commands/install-skill')(o); });

program.command('validate <project-dir>')
  .description('Validate active Spec gates')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--archive-ready', 'require archive readiness gates')
  .action(function(p, o) { require('../src/commands/validate')(p, o); });

program.command('archive <project-dir> <spec-name>')
  .description('Archive completed Spec')
  .option('--authorized-by <identity>', 'required one-shot human:<name> authorization')
  .option('--authorization-evidence <text>', 'required single-line evidence of current user authorization')
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

var verify = program.command('verify').description('Manage explicit verification providers and runs');
verify.exitOverride(function(error) {
  if (error.exitCode === 0) process.exit(0);
  console.error('[SDD_VERIFY_USAGE] ' + String(error.message || 'invalid verify command usage').replace(/^error:\s*/i, ''));
  process.exit(3);
});

verify.command('init <project-dir>')
  .description('Create or update a named verification provider')
  .requiredOption('--provider <name>', 'provider id')
  .requiredOption('--adapter <id>', 'registered adapter id')
  .requiredOption('--workspace-root <path>', 'workspace root relative to project')
  .requiredOption('--package-root <path>', 'package root relative to workspace')
  .requiredOption('--config <path>', 'adapter config relative to workspace')
  .option('--project <name...>', 'configured project names')
  .action(function(p, o) { require('../src/commands/verify').init(p, o); });

verify.command('run <project-dir>')
  .description('Run verification for a Spec')
  .requiredOption('--spec <path>', 'spec path or name')
  .option('--ac <id...>', 'target AC ids')
  .option('--allow-env <name...>', 'explicit environment variable names to pass to the Adapter')
  .action(function(p, o) { require('../src/commands/verify').run(p, o); });

verify.command('visual <project-dir>')
  .description('Run controlled visual verification for a fidelity visual contract')
  .requiredOption('--spec <path>', 'active spec path or name')
  .action(function(p, o) { require('../src/commands/verify').runVisual(p, o); });

var quality = program.command('quality').description('Generate read-only quality policy projections');
quality.exitOverride(function(error) {
  if (error.exitCode === 0) process.exit(0);
  console.error('[SDD_QUALITY_USAGE] ' + String(error.message || 'invalid quality command usage').replace(/^error:\s*/i, ''));
  process.exit(3);
});

quality.command('plan <project-dir>')
  .description('Project a read-only quality policy plan for a Spec')
  .option('--spec <path>', 'spec file')
  .option('--name <slug>', 'spec task slug')
  .option('--format <format>', 'text | json', 'text')
  .action(function(p, o) { require('../src/commands/quality').plan(p, o); });

var profile = program.command('profile').description('Manage project engineering profiles');
profile.exitOverride(function(error) {
  if (error.exitCode === 0) process.exit(0);
  console.error('[SDD_PROFILE_USAGE] ' + String(error.message || 'invalid profile command usage').replace(/^error:\s*/i, ''));
  process.exit(3);
});

profile.command('detect <project-dir>')
  .description('Detect a read-only project profile candidate')
  .option('--format <format>', 'text | json', 'text')
  .action(function(p, o) { require('../src/commands/profile').detect(p, o); });

profile.command('review <project-dir>')
  .description('Validate and canonicalize a saved profile candidate')
  .requiredOption('--candidate <file>', 'candidate JSON relative to project')
  .option('--format <format>', 'text | json', 'text')
  .action(function(p, o) { require('../src/commands/profile').review(p, o); });

profile.command('confirm <project-dir>')
  .description('Confirm a reviewed profile candidate with explicit human authorization')
  .option('--candidate <file>', 'candidate JSON relative to project')
  .option('--expected-digest <digest>', 'exact reviewed sha256 digest')
  .option('--confirmed-by <identity>', 'auditable human:<name> declaration')
  .option('--confirmation-evidence <text>', 'single-line authorization evidence')
  .option('--format <format>', 'text | json', 'text')
  .action(function(p, o) { require('../src/commands/profile').confirm(p, o); });

profile.command('show <project-dir>')
  .description('Show and validate a confirmed project profile revision')
  .option('--revision <digest>', 'specific immutable profile digest')
  .option('--format <format>', 'text | json', 'text')
  .action(function(p, o) { require('../src/commands/profile').show(p, o); });

profile.command('check <project-dir>')
  .description('Check confirmed profile facts for read-only drift')
  .option('--format <format>', 'text | json', 'text')
  .action(function(p, o) { require('../src/commands/profile').check(p, o); });

program.parse(normalizeCommandAliases(process.argv));
