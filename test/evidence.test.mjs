import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('frozen source snapshots match the recorded upstream hashes', async () => {
  const manifest = JSON.parse(await readFile('evidence/manifest.json', 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(file.snapshot);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.snapshot);
  }
});

test('external checkout fails original typechecks and accepts the documentation patches', async () => {
  await mkdir('.generated', { recursive: true });
  const directory = await mkdtemp(resolve('.generated/upstream-'));
  try {
    const manifest = JSON.parse(await readFile('evidence/manifest.json', 'utf8'));
    await mkdir(join(directory, 'docs/sdk/get-started'), { recursive: true });
    for (const entry of manifest.files) {
      await writeFile(join(directory, entry.source), await readFile(entry.snapshot));
    }
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    const check = () => spawnSync(process.execPath, ['scripts/check-docs.mjs', '--docs-root', directory], { encoding: 'utf8' });
    const original = check();
    assert.equal(original.status, 1, original.stderr);
    assert.match(original.stderr, /TS2305/);
    for (const name of ['0001-readme-hoodi-chain-id.patch', '0002-getting-started-examples.patch']) {
      const patch = resolve('patches', name);
      execFileSync('git', ['apply', '--check', patch], { cwd: directory });
      execFileSync('git', ['apply', patch], { cwd: directory });
    }
    for (const entry of manifest.files) {
      const corrected = entry.snapshot.replace('evidence/upstream/', 'examples/');
      assert.equal(await readFile(join(directory, entry.source), 'utf8'), await readFile(corrected, 'utf8'));
    }
    const corrected = check();
    assert.equal(corrected.status, 0, corrected.stderr);
    assert.match(corrected.stdout, /Typechecked 8 documentation snippets/);
  } finally {
    await rm(directory, { recursive: true, force: true });
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
