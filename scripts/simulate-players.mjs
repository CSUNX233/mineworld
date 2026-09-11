import { createRequire } from 'node:module';
import { mkdir, writeFile, appendFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const runs = Number(option('--runs', '100'));
const workers = Number(option('--workers', '2'));
const seedStart = Number(option('--seed-start', '41001'));
const url = option('--url', 'http://127.0.0.1:5173');
const output = resolve(option('--out', 'C:/Users/34229/.codex/visualizations/mineworld-player-sim/latest'));
const maxSeconds = Number(option('--max-seconds', '2700'));
const dt = Number(option('--dt', '0.05'));
const maxWallSeconds = Number(option('--max-wall-seconds', '240'));
if (!Number.isInteger(runs) || runs < 2 || runs % 2) throw new Error('--runs must be a positive even number.');
if (!Number.isInteger(workers) || workers < 1 || workers > 4) throw new Error('--workers must be between 1 and 4.');
await mkdir(output, { recursive: true });
const runsPath = join(output, 'runs.jsonl');
try {
  // Reserve the result set before writing any other artifact. Reusing an output
  // directory with completed or partial runs must never destroy its evidence.
  await writeFile(runsPath, '', { flag: 'wx' });
} catch (error) {
  if (error?.code === 'EEXIST') throw new Error(`Refusing to overwrite existing run data: ${runsPath}`);
  throw error;
}
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/34229/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else if (entry.isFile()) files.push(path.replaceAll('\\', '/'));
  }
  return files;
}

const rootFiles = (await readdir('.', { withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => entry.name);
const packageConfigs = rootFiles.filter(name =>
  /^package(?:-[^.]+)?\.json$/i.test(name)
  || /^(?:npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(name)
  || /^tsconfig(?:\.[^.]+)?\.json$/i.test(name)
  || /^vite\.config\.(?:ts|js|mts|mjs|cts|cjs)$/i.test(name));
const sources = [
  ...(await walkFiles('src')).filter(file => file.endsWith('.ts') || file.endsWith('.json')),
  ...packageConfigs,
  'scripts/simulate-players.mjs',
].sort();
const hashes = {};
const snapshotRoot = join(output, 'source-snapshot');
await mkdir(snapshotRoot, { recursive: true });
for (const file of sources) {
  const source = await readFile(file);
  hashes[file] = createHash('sha256').update(source).digest('hex');
  const snapshotPath = join(snapshotRoot, file);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, source);
}
const git = args => {
  try { return execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim(); }
  catch (error) { return `unavailable: ${error instanceof Error ? error.message : String(error)}`; }
};
const gitStatusText = git(['status', '--short']);
const metadata = { startedAt: new Date().toISOString(), url, runs, workers, seedStart, dt, maxSeconds,
  browser: 'msedge', viewport: { width: 1280, height: 800 },
  browserPlugin: 'Browser plugin not available; isolated Playwright context',
  revision: git(['rev-parse', 'HEAD']),
  gitStatus: gitStatusText ? gitStatusText.split(/\r?\n/) : [],
  sourceSnapshotFiles: sources,
  packageConfigs,
  hashes, pairedMapSeeds: true, randomDropsIdenticalAcrossPersonas: false,
};
const queue = [];
for (let index = 0; index < runs / 2; index++) for (const persona of ['novice', 'expert']) {
  queue.push({ index: queue.length, seed: seedStart + index, persona, dt, maxSeconds });
}
let cursor = 0;
const results = [];
const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
metadata.browserVersion = browser.version();
await writeFile(join(output, 'metadata.json'), JSON.stringify(metadata, null, 2));
const started = Date.now();
try {
  await Promise.all(Array.from({ length: workers }, async (_, worker) => {
    while (cursor < queue.length) {
      const config = queue[cursor++];
      const context = await browser.newContext({ viewport: metadata.viewport });
      const page = await context.newPage();
      await page.exposeFunction('__simulationProgress', data => {
        if (args.includes('--verbose')) console.log(JSON.stringify({ progress: true, worker, ...data }));
      });
      const errors = [];
      const pageErrors = [];
      const consoleErrors = [];
      const resource404s = [];
      const fatalBrowserErrors = [];
      const isResource404 = message => /\b404\b/.test(message)
        && /failed to load resource|not found|err_http_response_code_failure/i.test(message);
      page.on('pageerror', error => {
        const message = error.message;
        errors.push(message);
        pageErrors.push(message);
        if (isResource404(message)) resource404s.push(`pageerror: ${message}`);
        else fatalBrowserErrors.push(`pageerror: ${message}`);
      });
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        errors.push(text);
        consoleErrors.push(text);
        if (isResource404(text)) resource404s.push(`console: ${text}`);
        else fatalBrowserErrors.push(`console: ${text}`);
      });
      const wallStart = Date.now();
      let result;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!window.game, undefined, { timeout: 60000 });
        if (config.index === 0) {
          const identity = { url: page.url(), title: await page.title(), bodyText: (await page.locator('body').innerText()).slice(0, 600) };
          await writeFile(join(output, 'page-identity.json'), JSON.stringify(identity, null, 2));
          await page.screenshot({ path: join(output, 'start.png') });
        }
        let timer;
        try {
          result = await Promise.race([
            page.evaluate(async options => {
              const harness = await import('/src/simulation/SimulationHarness.ts');
              return await harness.runSimulation(window.game, options);
            }, config),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Simulation wall-clock budget exceeded')), maxWallSeconds * 1000); }),
          ]);
        } finally { clearTimeout(timer); }
        if (config.index < 2) await page.screenshot({ path: join(output, `${config.persona}-end.png`) });
      } catch (error) {
        result = { seed: config.seed, persona: config.persona, outcome: 'invalid', invalidReason: String(error) };
      } finally {
        await context.close();
      }
      if (fatalBrowserErrors.length) {
        const priorOutcome = result?.outcome;
        const priorReason = result?.invalidReason;
        result = {
          ...result,
          outcome: 'invalid',
          ...(priorOutcome && priorOutcome !== 'invalid' ? { simulationOutcome: priorOutcome } : {}),
          invalidReason: [priorReason, `browser_error:${fatalBrowserErrors.join(' | ')}`].filter(Boolean).join('; '),
        };
      }
      const record = { ...config, ...result, worker, wallSeconds: (Date.now() - wallStart) / 1000,
        errors, pageErrors, consoleErrors, resource404s, fatalBrowserErrors };
      results.push(record);
      await appendFile(runsPath, JSON.stringify(record) + '\n');
      console.log(JSON.stringify({ completed: results.length, total: runs, seed: record.seed, persona: record.persona,
        outcome: record.outcome, floor: record.floor, seconds: record.time ?? record.simulatedSeconds,
        wall: Math.round(record.wallSeconds), invalidReason: record.invalidReason }));
    }
  }));
} finally {
  await browser.close();
}
function wilson(wins, count) {
  if (!count) return [0, 1];
  const z = 1.96, p = wins / count, denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
const groups = {};
for (const persona of ['novice', 'expert']) {
  const all = results.filter(row => row.persona === persona);
  const wins = all.filter(row => row.outcome === 'victory').length;
  const deaths = all.filter(row => row.outcome === 'death');
  const valid = wins + deaths.length;
  const passedFive = all.filter(row => (row.outcome === 'victory' || row.outcome === 'death') && row.floor >= 6).length;
  const floors = {};
  for (const row of deaths) floors[row.floor] = (floors[row.floor] ?? 0) + 1;
  groups[persona] = { planned: runs / 2, recorded: all.length, valid, wins, deaths: deaths.length,
    invalid: all.length - valid, winRate: valid ? wins / valid : null, wilson95: wilson(wins, valid), deathFloors: floors,
    passedFive, firstFiveRate: valid ? passedFive / valid : null, firstFiveWilson95: wilson(passedFive, valid),
    meanFloor: all.reduce((sum, row) => sum + (row.floor ?? 0), 0) / Math.max(1, all.length),
    meanSimulatedSeconds: all.reduce((sum, row) => sum + (row.time ?? row.simulatedSeconds ?? 0), 0) / Math.max(1, all.length),
  };
}
const summary = { ...metadata, finishedAt: new Date().toISOString(), wallSeconds: (Date.now() - started) / 1000,
  groups, target: { novice: 0.5, expert: 0.8, tolerance: 0.08, noviceFirstFiveMinimum: 0.9 },
  converged: groups.novice.firstFiveRate >= 0.9 && Object.entries(groups).every(([persona, group]) => group.invalid === 0 && Math.abs(group.winRate - (persona === 'novice' ? 0.5 : 0.8)) <= 0.080001),
};
await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.groups, null, 2));
console.log(`Results: ${output}`);
if (results.some(row => row.outcome === 'invalid')) process.exitCode = 2;
