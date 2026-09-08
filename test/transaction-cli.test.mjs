import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('transaction CLI requires explicit execution and rejects unknown options', () => {
  for (const args of [['--unknown'], ['--output'], ['--execute', '--execute']]) {
    const result = spawnSync(process.execPath, ['scripts/check-transactions.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
  }
});

test('transaction CLI reports missing wallet configuration and never overwrites evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'transaction-cli-'));
  const output = join(directory, 'run.json');
  try {
    const result = spawnSync(process.execPath, ['scripts/check-transactions.mjs', '--output', output], {
      encoding: 'utf8', env: { ...process.env, HOODI_WALLET_FILE: '' },
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.deepEqual(report.transactions, []);
    assert.match(report.error, /HOODI_WALLET_FILE/);
    await writeFile(output, 'preserve existing transaction evidence');
    const repeat = spawnSync(process.execPath, ['scripts/check-transactions.mjs', '--execute', '--output', output], {
      encoding: 'utf8', env: { ...process.env, HOODI_WALLET_FILE: '' },
    });
    assert.equal(repeat.status, 1);
    assert.equal(await readFile(output, 'utf8'), 'preserve existing transaction evidence');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
