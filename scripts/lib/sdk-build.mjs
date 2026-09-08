import { cp, mkdir, readdir, readFile, writeFile, symlink, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runStep } from './verification.mjs';

export const kitFiles = ['LICENSE', 'NOTICE', 'licenses', 'package.json', 'package-lock.json', 'tsconfig.json', 'src', 'scripts', 'test', 'examples', 'evidence', 'patches'];

export async function digestFiles(root, paths) {
  const hash = createHash('sha256');
  let count = 0;
  async function visit(name) {
    const path = join(root, name);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Source snapshots must not contain symlinks: ${name}`);
    if (stat.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await visit(`${name}/${child}`);
    } else {
      const bytes = await readFile(path);
      hash.update(`${name}\0${bytes.length}\0`).update(bytes);
      count++;
    }
  }
  for (const path of [...paths].sort()) await visit(path);
  return { sha256: hash.digest('hex'), files: count };
}

export function gitIdentity(root) {
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  };
}

export async function buildSdk(sourceRoot, kitRoot, workspace, report) {
  const sourcePackage = join(sourceRoot, 'packages/sdk');
  const metadata = JSON.parse(await readFile(join(sourcePackage, 'package.json'), 'utf8'));
  if (metadata.name !== '@lidofinance/lido-ethereum-sdk') throw new Error('Source checkout is not the Lido Ethereum SDK');
  const identity = gitIdentity(sourceRoot);
  report.sdk.sourceCommit = identity.commit;
  report.sdk.sourceDirty = identity.dirty;
  const paths = ['packages/sdk/src', 'packages/sdk/LICENSE.txt', 'packages/sdk/package.json', 'packages/sdk/tsconfig.build.json', 'tsconfig.base.json'];
  report.sdk.sourceDigest = await digestFiles(sourceRoot, paths);
  const buildRoot = join(workspace, 'source');
  for (const name of paths) {
    await mkdir(join(buildRoot, name, '..'), { recursive: true });
    await cp(join(sourceRoot, name), join(buildRoot, name), { recursive: true });
  }
  const copiedDigest = await digestFiles(buildRoot, paths);
  if (copiedDigest.sha256 !== report.sdk.sourceDigest.sha256) {
    throw new Error('SDK source changed while the build snapshot was being copied');
  }
  await symlink(join(kitRoot, 'node_modules'), join(buildRoot, 'node_modules'), 'dir');
  const sdk = join(buildRoot, 'packages/sdk');
  runStep(report, 'build-source-sdk', process.execPath, [
    join(kitRoot, 'node_modules/typescript/bin/tsc'), '--project', join(sdk, 'tsconfig.build.json'),
    '--module', 'nodenext', '--outDir', join(sdk, 'dist/esm'), '--declaration',
    '--declarationDir', join(sdk, 'dist/types'), '--declarationMap', '--noEmitOnError',
  ], kitRoot);
  await writeFile(join(sdk, 'dist/esm/package.json'), '{"type":"module","sideEffects":false}\n');
  report.sdk.artifactDigest = await digestFiles(sdk, ['dist']);
  report.sdk.build = 'ESM and declarations; original source/configs; project-pinned compiler and dependencies';
  const consumer = join(workspace, 'consumer');
  await mkdir(consumer, { recursive: true });
  for (const name of kitFiles) await cp(join(kitRoot, name), join(consumer, name), { recursive: true });
  await mkdir(join(consumer, 'node_modules/@lidofinance'), { recursive: true });
  for (const name of await readdir(join(kitRoot, 'node_modules'))) {
    if (name === '@lidofinance') {
      for (const child of await readdir(join(kitRoot, 'node_modules', name))) {
        const target = child === 'lido-ethereum-sdk' ? sdk : join(kitRoot, 'node_modules', name, child);
        await symlink(resolve(target), join(consumer, 'node_modules', name, child), 'dir');
      }
    } else {
      await symlink(join(kitRoot, 'node_modules', name), join(consumer, 'node_modules', name));
    }
  }
  return { consumer, sdk };
}
