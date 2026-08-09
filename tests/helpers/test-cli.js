'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', '..', 'bin', 'cli.js');

function runSddCli(args, options) {
  const result = spawnSync(process.execPath, [CLI].concat(args), {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8'
  });

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    output: String(result.stdout || '') + String(result.stderr || '')
  };
}

module.exports = { runSddCli };
