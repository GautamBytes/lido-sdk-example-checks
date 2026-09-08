import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Only execute the reviewed, committed snapshots in this repository.
// This helper is not a sandbox for untrusted Markdown.
export async function snippet(file, heading) {
  const markdown = await readFile(file, 'utf8');
  const section = markdown.split(`\n${heading}\n`)[1];
  const code = section?.match(/```ts\r?\n([\s\S]*?)```/)?.[1];
  if (!code) throw new Error(`Missing TypeScript snippet: ${file} / ${heading}`);
  return code;
}

export async function execute(code) {
  const parent = resolve('.generated');
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, 'snippet-'));
  try {
    const output = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
      },
    }).outputText;
    const file = join(dir, 'snippet.mjs');
    await writeFile(file, output);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const initializationContext = `
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
// The upstream fragment assumes a previously defined optional wallet provider.
const provider = undefined;
`;
