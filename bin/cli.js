#!/usr/bin/env node
var program = require('commander').program;

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
  .requiredOption('--spec-version <ver>', 'spec version vN.M')
  .option('--requirement <text>', 'requirement')
  .option('--goal <text>', 'goal')
  .option('--constraints <text>', 'constraints')
  .option('--context <text>', 'context')
  .option('--mode <mode>', 'spec mode')
  .action(function(p, o) { o.version = o.specVersion; require('../src/commands/discover')(p, o); });

program.command('resume <project-dir>')
  .description('Resume existing task')
  .action(function(p) { require('../src/commands/resume')(p); });

program.command('status <project-dir>')
  .description('Check project health')
  .action(function(p) { require('../src/commands/status')(p); });

program.command('archive <project-dir> <spec-name>')
  .description('Archive completed Spec')
  .option('--force', 'overwrite')
  .action(function(p, n, o) { require('../src/commands/archive')(p, n, o); });

program.command('reopen <project-dir> <task-slug>')
  .description('Reopen archived task as patch')
  .requiredOption('--defect <text>', 'defect description')
  .option('--mode <mode>', 'patch mode', 'micro')
  .action(function(p, s, o) { require('../src/commands/reopen')(p, s, o); });

program.command('review-execute <project-dir>')
  .description('Generate 4-axis Review prompt')
  .option('--spec <path>', 'spec file')
  .option('--diff-base <rev>', 'git diff base')
  .action(function(p, o) { require('../src/commands/review-execute')(p, o); });

program.command('create-codemap <project-dir>')
  .description('Generate CodeMap creation prompt')
  .option('--module <name>', 'module name')
  .action(function(p, o) { require('../src/commands/create-codemap')(p, o); });

program.command('build-context-bundle <project-dir>')
  .description('Generate Context Bundle prompt')
  .option('--sources <dir>', 'sources dir')
  .option('--out <name>', 'bundle name')
  .option('--spec-version <ver>', 'bundle version')
  .action(function(p, o) { require('../src/commands/build-context-bundle')(p, o); });

program.command('debug <project-dir>')
  .description('Generate Debug prompt')
  .option('--log <file>', 'log file')
  .option('--error <msg>', 'error message')
  .action(function(p, o) { require('../src/commands/debug')(p, o); });

program.command('create-projectmap <project-dir>')
  .description('Generate ProjectMap creation prompt')
  .option('--repos <list>', 'repo list')
  .option('--force', 'overwrite')
  .action(function(p, o) { require('../src/commands/create-projectmap')(p, o); });

program.command('new-codemap <project-dir> <module-name>')
  .description('Create blank CodeMap')
  .option('--force', 'overwrite')
  .action(function(p, m, o) { require('../src/commands/new-codemap')(p, m, o); });

program.command('new-projectmap <project-dir>')
  .description('Create blank ProjectMap')
  .option('--repos <list>', 'repo list')
  .option('--force', 'overwrite')
  .action(function(p, o) { require('../src/commands/new-projectmap')(p, o); });

program.parse();
