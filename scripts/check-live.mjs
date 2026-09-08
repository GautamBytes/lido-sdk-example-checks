import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { http } from 'viem';
import { runLiveChecks } from './lib/live-read.mjs';
import { digestFiles, gitIdentity } from './lib/sdk-build.mjs';

const args = process.argv.slice(2);
const help = 'Usage: npm run check:live -- [--output reports/hoodi-live.json]\nHOODI_RPC_URL optionally selects an HTTP(S) Hoodi endpoint. No wallet or funds needed.';
if (args.length === 1 && args[0] === '--help') {
  console.log(help);
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--output' || args[1].startsWith('--') || !args[1].endsWith('.json'))) {
  console.error(help);
  process.exit(2);
}
const output = resolve(args[1] ?? 'reports/hoodi-live.json');
const root = fileURLToPath(new URL('..', import.meta.url));
const defaultRpc = 'https://rpc.hoodi.ethpandaops.io';
const rpcUrl = process.env.HOODI_RPC_URL ?? defaultRpc;
let report = { schemaVersion: 1, mode: 'live-read-only', status: 'failed', checks: [], generatedAt: new Date().toISOString() };
try {
  let url;
  try { url = new URL(rpcUrl); } catch { throw new Error('HOODI_RPC_URL must be an HTTP(S) URL'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HOODI_RPC_URL must be an HTTP(S) URL');
  // No wallet client is constructed. Each request has a bounded timeout and no retries.
  const transport = http(rpcUrl, { timeout: 10_000, retryCount: 0 })({});
  report = await runLiveChecks(transport.request);
  report.endpoint = rpcUrl === defaultRpc ? defaultRpc : 'custom endpoint (URL omitted)';
  const sdkRoot = join(root, 'node_modules/@lidofinance/lido-ethereum-sdk');
  const sdkPackage = JSON.parse(await readFile(join(sdkRoot, 'package.json'), 'utf8'));
  report.sdk = { version: sdkPackage.version, artifactDigest: await digestFiles(sdkRoot, ['dist/esm', 'dist/types']) };
  report.runtime = { node: process.version };
  report.project = gitIdentity(root);
  report.checkerDigest = await digestFiles(root, ['scripts/check-live.mjs', 'scripts/lib/live-read.mjs', 'scripts/lib/sdk-build.mjs', 'scripts/lib/verification.mjs']);
  report.lockfileDigest = await digestFiles(root, ['package-lock.json']);
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
}
const markdown = [
  '# Hoodi live read checks', '', `Status: **${report.status}**`,
  ...(report.sdk ? [`SDK: ${report.sdk.version}`] : []),
  ...(report.project ? [`Project commit: \`${report.project.commit}\` (dirty: ${report.project.dirty})`] : []),
  ...(report.block ? [`Finalized block: ${report.block.number}`, `Block hash: \`${report.block.hash}\``] : []),
  '', '| Check | Status |', '| --- | --- |',
  ...report.checks.map((check) => `| ${check.name} | ${check.status} |`),
  '', ...(report.error ? [`Error: ${report.error}`, ''] : []),
  ...report.checks.filter((check) => check.reason).map((check) => check.reason),
  ...(report.results ? ['```json', JSON.stringify(report.results, null, 2), '```', ''] : []),
  ...(report.limitations ?? ['Read-only check; no signing or transaction broadcasts.']), '',
].join('\n');
try {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await writeFile(output.replace(/\.json$/, '.md'), markdown);
  for (const check of report.checks) console.log(`${check.status.toUpperCase()}: ${check.name}`);
  console.log(`Live read verification: ${report.status}. Report: ${output}`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
} catch {
  console.error('Could not write the live verification report');
  process.exitCode = 1;
}
