import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import ts from 'typescript';

// Generate beneath the project so imports resolve against its pinned dependencies.
export async function typecheck(snippets) {
  await mkdir('.generated', { recursive: true });
  const directory = await mkdtemp(resolve('.generated/types-'));
  try {
    const sources = new Map();
    for (const [index, source] of snippets.entries()) {
      const file = join(directory, `${index}.mts`);
      await writeFile(file, source.code);
      sources.set(file, source);
    }
    const program = ts.createProgram([...sources.keys()], {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const source = diagnostic.file && sources.get(diagnostic.file.fileName);
      const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return {
        id: source?.id ?? 'compiler',
        file: source?.file ?? diagnostic.file?.fileName ?? 'compiler',
        line: (source?.line ?? 1) + (position?.line ?? 0),
        column: (position?.character ?? 0) + 1,
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      };
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
