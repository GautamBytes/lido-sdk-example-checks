import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readSnippet } from '../scripts/lib/markdown.mjs';
import { typecheck } from '../scripts/lib/typecheck.mjs';

test('eight selected documentation snippets typecheck as independent modules', async () => {
  const manifest = JSON.parse(await readFile('examples/manifest.json', 'utf8'));
  const sources = await Promise.all(manifest.map(async (entry) => ({
    ...entry, ...await readSnippet(entry.file, entry.heading, entry.index),
  })));
  assert.equal(sources.length, 8);
  assert.deepEqual(await typecheck(sources), []);
});

test('restoring the bad viem import and wrong getter produces source-located errors', async () => {
  const core = await readSnippet('examples/basic-examples.md', '## Core example');
  const wrap = await readSnippet('examples/basic-examples.md', '## Wrap example');
  assert.match(core.code, /from 'viem\/chains'/);
  assert.match(wrap.code, /lidoSDK\.wrap\.getContractWstETH/);
  const diagnostics = await typecheck([
    { ...core, id: 'bad-import', file: 'examples/basic-examples.md',
      code: core.code.replace("from 'viem/chains'", "from 'viem'") },
    { ...wrap, id: 'bad-getter', file: 'examples/basic-examples.md',
      code: wrap.code.replace('lidoSDK.wrap.getContractWstETH', 'lidoSDK.withdraw.getContractWstETH') },
  ]);
  const importLine = core.line + core.code.split('\n').findIndex((line) => line.includes("from 'viem/chains'"));
  const getterLine = wrap.line + wrap.code.split('\n').findIndex((line) => line.includes('lidoSDK.wrap.getContractWstETH'));
  assert.ok(diagnostics.some((d) => d.id === 'bad-import' && d.code === 2305 && d.line === importLine));
  assert.ok(diagnostics.some((d) => d.id === 'bad-getter' && d.code === 2339 && d.line === getterLine));
});
