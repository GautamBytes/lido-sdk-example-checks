import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
import { LidoLocatorAbi } from '@lidofinance/lido-ethereum-sdk/core';
import { WithdrawalQueueAbi } from '@lidofinance/lido-ethereum-sdk/withdraw';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readOnlyRequest, runLiveChecks, HOODI_CONTRACTS } from '../scripts/lib/live-read.mjs';

const rateAbi = parseAbi(['function stEthPerToken() view returns (uint256)']);
const hash = `0x${'ab'.repeat(32)}`;

function fixture(options = {}) {
  const calls = [];
  const request = async ({ method, params }) => {
    calls.push({ method, params });
    if (options.offline) throw new Error('Provider failed at https://secret:password@example.com/private-key?token=secret');
    if (method === 'eth_chainId') return options.wrongChain ? '0x1' : '0x88bb0';
    if (method === 'eth_getBlockByNumber') return { number: '0x123', hash, timestamp: '0x65000000' };
    assert.equal(params[1], '0x123', 'every state read must use the captured block');
    if (method === 'eth_getCode') return options.noCode ? '0x' : '0x6000';
    if (method === 'eth_getBalance') return '0x0';
    assert.equal(method, 'eth_call');
    const address = params[0].to.toLowerCase();
    let abi;
    if (address === HOODI_CONTRACTS.locator.toLowerCase()) abi = LidoLocatorAbi;
    else if (address === HOODI_CONTRACTS.wstETH.toLowerCase()) abi = rateAbi;
    else if (address === HOODI_CONTRACTS.withdrawalQueue.toLowerCase()) abi = WithdrawalQueueAbi;
    else throw new Error(`Unexpected address ${address}`);
    const { functionName, args } = decodeFunctionData({ abi, data: params[0].data });
    let result;
    if (functionName === 'wstETH' || functionName === 'withdrawalQueue') {
      result = options.wrongDeployment ? '0x0000000000000000000000000000000000000001' : HOODI_CONTRACTS[functionName];
    } else if (functionName === 'stEthPerToken') result = options.zeroRate ? 0n : 112n * 10n ** 16n;
    else if (functionName === 'getLastRequestId') result = options.emptyQueue ? 0n : 43n;
    else if (functionName === 'getWithdrawalStatus') {
      assert.deepEqual(args, [[43n]]);
      if (options.badStatus) return '0x';
      result = [{ amountOfStETH: 10n ** 18n, amountOfShares: 9n * 10n ** 17n,
        owner: HOODI_CONTRACTS.locator, timestamp: 1_700_000_000n, isFinalized: true, isClaimed: false }];
    } else throw new Error(`Unexpected function ${functionName}`);
    return encodeFunctionResult({ abi, functionName, result });
  };
  return { request, calls };
}

test('live checker uses the real SDK at one block and discovers an existing withdrawal ID', async () => {
  const rpc = fixture();
  const report = await runLiveChecks(rpc.request);
  assert.equal(report.status, 'passed');
  assert.equal(report.mode, 'live-read-only');
  assert.deepEqual(report.block, { number: '291', hash, timestamp: '1694498816' });
  assert.equal(report.results.balanceWei, '0');
  assert.equal(report.results.stEthPerToken, '1120000000000000000');
  assert.equal(report.results.withdrawal.id, '43');
  assert.equal(report.results.withdrawal.isFinalized, true);
  assert.equal(report.checks.length, 6);
  assert.ok(report.checks.every((check) => check.status === 'passed'));
  assert.ok(rpc.calls.length > 6);
});

test('live transport refuses signing and sends before they reach the provider', async () => {
  let calls = 0;
  const request = readOnlyRequest(async () => { calls++; });
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_signTypedData_v4', 'personal_sign', 'wallet_requestPermissions']) {
    await assert.rejects(request({ method, params: [] }), /not allowed/);
  }
  assert.equal(calls, 0);
});

test('a mainnet endpoint is rejected before any contract or balance reads', async () => {
  const rpc = fixture({ wrongChain: true });
  const report = await runLiveChecks(rpc.request);
  assert.equal(report.status, 'failed');
  assert.match(report.error, /Expected Hoodi/);
  assert.deepEqual(rpc.calls.map((call) => call.method), ['eth_chainId']);
});

for (const [option, stage] of [
  ['noCode', 'deployed-contracts'], ['wrongDeployment', 'deployed-contracts'],
  ['zeroRate', 'wrapping-rate'], ['badStatus', 'withdrawal-status'],
]) {
  test(`live checker reports ${option} as failure at ${stage}`, async () => {
    const report = await runLiveChecks(fixture({ [option]: true }).request);
    assert.equal(report.status, 'failed');
    assert.equal(report.checks.at(-1).name, stage);
    assert.equal(report.checks.at(-1).status, 'failed');
  });
}

test('an empty withdrawal queue cannot be reported as fully verified', async () => {
  const report = await runLiveChecks(fixture({ emptyQueue: true }).request);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.checks.at(-1).status, 'skipped');
  assert.match(report.checks.at(-1).reason, /No withdrawal requests/);
});

test('provider failure is reported without leaking RPC credentials or URLs', async () => {
  const report = await runLiveChecks(fixture({ offline: true }).request);
  assert.equal(report.status, 'failed');
  assert.match(report.error, /RPC request failed/);
  assert.doesNotMatch(JSON.stringify(report), /password|private-key|token=secret|example.com/);
});

test('live CLI validates arguments before starting a network check', () => {
  assert.match(execFileSync(process.execPath, ['scripts/check-live.mjs', '--help'], { encoding: 'utf8' }), /HOODI_RPC_URL/);
  for (const args of [['--unknown'], ['--output'], ['--output', 'bad.txt'], ['--output', 'a.json', '--output', 'b.json']]) {
    const result = spawnSync(process.execPath, ['scripts/check-live.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
  }
});

test('live CLI writes failed JSON and Markdown without exposing invalid RPC settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'live-report-'));
  try {
    const output = join(directory, 'failure.json');
    const result = spawnSync(process.execPath, ['scripts/check-live.mjs', '--output', output], {
      encoding: 'utf8', env: { ...process.env, HOODI_RPC_URL: 'not-a-url/secret-key' },
    });
    assert.equal(result.status, 1);
    const json = await readFile(output, 'utf8');
    const markdown = await readFile(join(directory, 'failure.md'), 'utf8');
    assert.equal(JSON.parse(json).status, 'failed');
    assert.match(markdown, /failed/);
    assert.doesNotMatch(json + markdown + result.stdout + result.stderr, /secret-key/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
