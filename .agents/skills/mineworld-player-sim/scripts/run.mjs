import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const index = args.indexOf('--project');
const project = resolve(index >= 0 ? args[index + 1] : process.cwd());
if (index >= 0) args.splice(index, 2);
const child = spawn(process.execPath, [resolve(project, 'scripts/simulate-players.mjs'), ...args], {
  cwd: project, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
