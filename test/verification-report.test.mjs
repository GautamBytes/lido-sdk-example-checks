import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStep, tapCounts } from '../scripts/lib/verification.mjs';

test('verification propagates command failures and preserves stdout diagnostics', () => {
  const report = { checks: [] };
  assert.throws(() => runStep(report, 'broken', process.execPath,
    ['-e', "console.log('deliberate compiler failure'); process.exit(3)"], process.cwd()), /deliberate compiler failure/);
  assert.equal(report.checks[0].status, 'failed');
  assert.equal(report.checks[0].exitCode, 3);
});

test('report counts require a complete passing suite, not a zero-test or skipped run', () => {
  const output = '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n# cancelled 0\n';
  assert.deepEqual(tapCounts(output), { total: 2, passed: 2, failed: 0, skipped: 0, cancelled: 0 });
  for (const changed of [output.replace('# tests 2', '# tests 0'),
    output.replace('# skipped 0', '# skipped 1'), output.replace('# pass 2', '# pass 1'), '',
    output.replace('# fail 0', '# fail 1')]) {
    assert.throws(() => tapCounts(changed), /complete passing suite/);
  }
});
