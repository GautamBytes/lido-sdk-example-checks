import { readFile } from 'node:fs/promises';

export async function readSnippet(file, heading, index = 0) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  const start = lines.indexOf(heading);
  const level = heading.match(/^#+/)?.[0].length;
  if (start < 0 || !level || !Number.isInteger(index) || index < 0) {
    throw new Error(`Missing TypeScript snippet: ${file} / ${heading} [${index}]`);
  }
  let fence = null;
  let found = 0;
  for (let row = start + 1; row < lines.length; row++) {
    if (fence) {
      if (/^```\s*$/.test(lines[row])) {
        if (fence.typed && found++ === index) {
          return { code: lines.slice(fence.start, row).join('\n') + '\n', line: fence.start + 1 };
        }
        fence = null;
      }
      continue;
    }
    const nextHeading = lines[row].match(/^(#+)\s/);
    if (nextHeading && nextHeading[1].length <= level) break;
    if (/^```/.test(lines[row])) {
      fence = { start: row + 1, typed: /^```(?:ts|typescript)\s*$/.test(lines[row]) };
    }
  }
  throw new Error(`Missing TypeScript snippet: ${file} / ${heading} [${index}]`);
}
