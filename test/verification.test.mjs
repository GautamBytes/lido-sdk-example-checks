import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('verification CLI documents the installed and source SDK modes', () => {
  const result = spawnSync(process.execPath, ['scripts/verify.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--sdk-root/);
  assert.match(result.stdout, /--output/);
});

test('verification rejects unknown options instead of silently checking the wrong SDK', () => {
  const result = spawnSync(process.execPath, ['scripts/verify.mjs', '--sdk-rooot', '/missing'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
});

test('unavailable source SDK produces a failed report and a nonzero exit', async () => {
  await mkdir('.generated', { recursive: true });
  const directory = await mkdtemp(resolve('.generated/report-test-'));
  try {
    const output = join(directory, 'result.json');
    const result = spawnSync(process.execPath, [
      'scripts/verify.mjs', '--sdk-root', join(directory, 'missing'), '--output', output,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.sdk.kind, 'source');
    assert.ok(report.error);
    assert.equal(report.checks.some((check) => check.name === 'test-suite' && check.status === 'passed'), false);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
