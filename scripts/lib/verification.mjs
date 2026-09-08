import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function runStep(report, name, command, args, cwd) {
  const start = performance.now();
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
  });
  const step = {
    name, status: result.status === 0 && !result.error ? 'passed' : 'failed',
    exitCode: result.status, durationMs: Math.round(performance.now() - start),
  };
  report.checks.push(step);
  console.log(`${step.status.toUpperCase()}: ${name}`);
  if (step.status === 'failed') {
    throw new Error(`${name}: ${[result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n') || `exit ${result.status}`}`);
  }
  return result.stdout;
}

export function tapCounts(output) {
  const value = (name) => {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  const counts = { total: value('tests'), passed: value('pass'), failed: value('fail'),
    skipped: value('skipped'), cancelled: value('cancelled') };
  if (Object.values(counts).some((value) => value === null) || counts.total === 0 ||
      counts.passed !== counts.total || counts.failed || counts.skipped || counts.cancelled) {
    throw new Error('Test output does not confirm a complete passing suite');
  }
  return counts;
}

export async function writeReport(output, report, roots = []) {
  let json = JSON.stringify(report, null, 2);
  for (const [path, label] of roots.filter(([path]) => path).sort((a, b) => b[0].length - a[0].length)) {
    json = json.split(path).join(label);
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json + '\n');
  const markdown = [
    '# SDK verification', '',
    `Status: **${report.status}**`,
    `SDK target: ${report.sdk.kind}${report.sdk.version ? ` (${report.sdk.version})` : ''}`,
    ...(report.sdk.sourceCommit ? [`Source commit: \`${report.sdk.sourceCommit}\``] : []),
    '', '| Check | Status |', '| --- | --- |',
    ...report.checks.map((step) => `| ${step.name} | ${step.status} |`),
    '', ...(report.tests ? [`Tests: ${report.tests.passed}/${report.tests.total} passed.`] : []),
    '', 'Offline verification. Browser signing, broadcasts, and live-chain state are not covered.', '',
  ].join('\n');
  await writeFile(output.replace(/\.json$/, '') + '.md', markdown);
}
