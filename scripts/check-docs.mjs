import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readSnippet } from './lib/markdown.mjs';
import { typecheck } from './lib/typecheck.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--docs-root')) {
  console.error('Usage: node scripts/check-docs.mjs [--docs-root PATH]');
  process.exit(2);
}
const manifest = JSON.parse(await readFile(new URL('../examples/manifest.json', import.meta.url), 'utf8'));
const sources = [];
for (const entry of manifest) {
  const file = args.length ? resolve(args[1], entry.upstream) : entry.file;
  sources.push({ ...entry, file, ...await readSnippet(file, entry.heading, entry.index) });
}
const diagnostics = await typecheck(sources);
for (const item of diagnostics) {
  console.error(`${item.file}:${item.line}:${item.column} [${item.id}] TS${item.code}: ${item.message}`);
}
if (diagnostics.length) process.exitCode = 1;
else console.log(`Typechecked ${sources.length} documentation snippets against the installed SDK.`);
