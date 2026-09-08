import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { snippet } from './snippets.mjs';

test('selects the second initialization fence without reusing the first', async () => {
  const code = await snippet('evidence/upstream/usage.md', '## Initialization', 1);
  assert.match(code, /rpcUrls:/);
  assert.doesNotMatch(code, /createPublicClient/);
});

test('missing fence cannot borrow code from the following section', async () => {
  await mkdir('.generated', { recursive: true });
  const dir = await mkdtemp(resolve('.generated/markdown-'));
  try {
    const file = join(dir, 'sample.md');
    await writeFile(file, '# Demo\n\n## Empty\nText.\n\n## Next\n```ts\nconst wrong = true;\n```\n');
    await assert.rejects(snippet(file, '## Empty'), /Missing TypeScript snippet/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
