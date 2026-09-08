import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSdk, digestFiles, gitIdentity, kitFiles } from './lib/sdk-build.mjs';
import { runStep, tapCounts, writeReport } from './lib/verification.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: npm run verify -- [--sdk-root CHECKOUT] [--output REPORT.json]\nOmit --sdk-root to verify the installed release. Source mode builds the upstream SDK in isolation.');
  process.exit(0);
}
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const name = args[index];
  if (!['--sdk-root', '--output'].includes(name) || !args[index + 1] || args[index + 1].startsWith('--') || options[name]) {
    console.error(`Unknown option, missing value, or duplicate argument: ${name}`);
    process.exit(2);
  }
  options[name] = args[index + 1];
}
const kitRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = options['--sdk-root'] ? resolve(options['--sdk-root']) : null;
const output = resolve(options['--output'] ?? 'reports/verification.json');
if (!output.endsWith('.json')) { console.error('--output must end in .json'); process.exit(2); }
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'running',
  runtime: { node: process.version }, sdk: { kind: sourceRoot ? 'source' : 'installed' }, checks: [] };
let workspace;
try {
  let consumer = kitRoot;
  let sdk = join(kitRoot, 'node_modules/@lidofinance/lido-ethereum-sdk');
  if (sourceRoot) {
    await mkdir(join(kitRoot, '.generated'), { recursive: true });
    workspace = await mkdtemp(join(kitRoot, '.generated/sdk-verification-'));
    ({ consumer, sdk } = await buildSdk(sourceRoot, kitRoot, workspace, report));
  }
  report.project = { ...gitIdentity(kitRoot), digest: await digestFiles(kitRoot, kitFiles) };
  report.runtime.typescript = JSON.parse(await readFile(join(kitRoot, 'node_modules/typescript/package.json'), 'utf8')).version;
  report.runtime.viem = JSON.parse(await readFile(join(kitRoot, 'node_modules/viem/package.json'), 'utf8')).version;
  report.lockfile = await digestFiles(kitRoot, ['package-lock.json']);
  report.sdk.version = JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8')).version;
  if (!sourceRoot) report.sdk.artifactDigest = await digestFiles(sdk, ['dist/esm', 'dist/types']);
  const resolved = runStep(report, 'resolve-sdk-target', process.execPath, ['--input-type=module', '--eval',
    "import {realpathSync} from 'node:fs'; import {fileURLToPath} from 'node:url'; console.log(realpathSync(fileURLToPath(import.meta.resolve('@lidofinance/lido-ethereum-sdk'))));",
  ], consumer).trim();
  if (resolved !== await realpath(join(sdk, 'dist/esm/index.js'))) throw new Error('Resolved SDK differs from the requested verification target');
  report.sdk.targetVerified = true;
  runStep(report, 'standalone-types', process.execPath, [join(kitRoot, 'node_modules/typescript/bin/tsc'), '--noEmit'], consumer);
  runStep(report, 'documentation-types', process.execPath, ['scripts/check-docs.mjs'], consumer);
  const tests = runStep(report, 'test-suite', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], consumer);
  report.tests = tapCounts(tests);
  runStep(report, 'original-vs-fixed-reproduction', process.execPath, ['scripts/reproduce.mjs'], consumer);
  runStep(report, 'initialization-demo', process.execPath, ['--import', 'tsx', 'src/initialize.ts'], consumer);
  report.coverage = JSON.parse(await readFile(join(kitRoot, 'examples/manifest.json'), 'utf8')).map(({ id }) => id);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await writeReport(output, report, [[workspace, '<workspace>'], [sourceRoot, '<sdk-source>'], [kitRoot, '<project>']]);
  if (workspace) await rm(workspace, { recursive: true, force: true });
}
console.log(`Verification ${report.status}. Report: ${output}`);
