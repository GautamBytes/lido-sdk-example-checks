import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('frozen source snapshots match the recorded upstream hashes', async () => {
  const manifest = JSON.parse(await readFile('evidence/manifest.json', 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(file.snapshot);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.snapshot);
  }
});

test('upstream patch applies to the frozen README and yields the tested correction', async () => {
  await mkdir('.generated', { recursive: true });
  const directory = await mkdtemp(resolve('.generated/patch-'));
  try {
    await writeFile(join(directory, 'README.md'), await readFile('evidence/upstream/README.md'));
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    const patch = resolve('patches/0001-readme-hoodi-chain-id.patch');
    execFileSync('git', ['apply', '--check', patch], { cwd: directory });
    execFileSync('git', ['apply', patch], { cwd: directory });
    assert.equal(await readFile(join(directory, 'README.md'), 'utf8'),
      await readFile('examples/README.md', 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
