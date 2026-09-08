import assert from 'node:assert/strict';
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import { createPublicClient, custom } from 'viem';
import { hoodi } from 'viem/chains';

// Reviewed against https://docs.lido.fi/deployed-contracts/hoodi/ on 2026-09-08.
// Fail on deployment drift so an address change requires explicit review.
export const HOODI_CONTRACTS = Object.freeze({
  locator: '0xe2ef9536daaaebff5b1c130957ab3e80056b06d8',
  wstETH: '0x7e99ee3c66636de415d2d7c880938f2f40f94de4',
  withdrawalQueue: '0xfe56573178f1bcdf53f01a6e9977670dcbbd9186',
});
const allowedMethods = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_getCode', 'eth_getBalance']);
const stateMethods = new Set(['eth_call', 'eth_getCode', 'eth_getBalance']);

export function readOnlyRequest(request, blockTag) {
  return async ({ method, params = [] }) => {
    if (!allowedMethods.has(method)) throw new Error(`RPC method not allowed: ${method}`);
    const pinnedParams = blockTag && stateMethods.has(method) ? [params[0], blockTag] : params;
    try {
      return await request({ method, params: pinnedParams });
    } catch {
      // Provider errors can contain credentials in URLs, headers, and response bodies.
      throw new Error(`RPC request failed: ${method}; check endpoint availability and RPC access`);
    }
  };
}

export async function runLiveChecks(request) {
  const report = {
    schemaVersion: 1, mode: 'live-read-only', generatedAt: new Date().toISOString(),
    status: 'running', chainId: hoodi.id, checks: [], results: {},
    limitations: ['Read-only calls; no signing or transaction broadcasts.',
      'One finalized block from one RPC provider; not independent consensus verification.',
      'One existing withdrawal request; not every withdrawal state or a full withdrawal cycle.'],
  };
  const rpc = readOnlyRequest(request);
  async function check(name, action) {
    const step = { name, status: 'running' };
    report.checks.push(step);
    const started = performance.now();
    try {
      const result = await action();
      step.status = 'passed';
      return result;
    } catch (error) {
      step.status = 'failed';
      throw error;
    } finally {
      step.durationMs = Math.round(performance.now() - started);
    }
  }
  try {
    await check('hoodi-chain', async () => {
      const chain = await rpc({ method: 'eth_chainId' });
      assert.equal(BigInt(chain), BigInt(hoodi.id), 'Expected Hoodi chain ID 560048');
    });
    const block = await check('finalized-block', async () => {
      const block = await rpc({ method: 'eth_getBlockByNumber', params: ['finalized', false] });
      assert.ok(block && /^0x[0-9a-f]+$/i.test(block.number) && /^0x[0-9a-f]{64}$/i.test(block.hash)
        && /^0x[0-9a-f]+$/i.test(block.timestamp), 'RPC must return a finalized block with number, hash and timestamp');
      report.block = { number: BigInt(block.number).toString(), hash: block.hash, timestamp: BigInt(block.timestamp).toString() };
      return block;
    });
    const client = createPublicClient({ chain: hoodi,
      transport: custom({ request: readOnlyRequest(request, block.number) }, { retryCount: 0 }),
    });
    const sdk = new LidoSDK({ chainId: hoodi.id, publicClient: client });
    let wrap, queue;
    await check('deployed-contracts', async () => {
      const locator = sdk.core.getContractLidoLocator();
      assert.equal(locator.address.toLowerCase(), HOODI_CONTRACTS.locator, 'SDK locator differs from reviewed deployment');
      wrap = await sdk.wrap.getContractWstETH();
      queue = await sdk.withdraw.contract.getContractWithdrawalQueue();
      const contracts = { locator: locator.address, wstETH: wrap.address, withdrawalQueue: queue.address };
      report.contracts = contracts;
      for (const [name, address] of Object.entries(contracts)) {
        assert.equal(address.toLowerCase(), HOODI_CONTRACTS[name], `${name} differs from reviewed deployment`);
        const code = await client.getCode({ address });
        assert.ok(code && code !== '0x', `${name} has no deployed bytecode`);
      }
    });
    await check('eth-balance', async () => {
      // Read a public contract balance; no personal wallet address is required.
      const balance = await sdk.core.balanceETH(HOODI_CONTRACTS.locator);
      assert.ok(balance >= 0n, 'ETH balance must be nonnegative');
      report.results.balanceAddress = HOODI_CONTRACTS.locator;
      report.results.balanceWei = balance.toString();
    });
    await check('wrapping-rate', async () => {
      const rate = await wrap.read.stEthPerToken();
      assert.ok(rate > 0n, 'stEthPerToken must be positive');
      report.results.stEthPerToken = rate.toString();
    });
    const lastRequestId = await check('withdrawal-status', async () => {
      const id = await queue.read.getLastRequestId();
      report.results.lastRequestId = id.toString();
      if (id === 0n) return id;
      const statuses = await sdk.withdraw.views.getWithdrawalStatus({ requestsIds: [id] });
      assert.equal(statuses.length, 1, 'Expected one withdrawal status');
      const status = statuses[0];
      assert.equal(status.id, id, 'Returned withdrawal ID must match the request');
      assert.ok(status.amountOfStETH > 0n && status.timestamp > 0n, 'Withdrawal must describe an existing request');
      report.results.withdrawal = JSON.parse(JSON.stringify(status, (_, value) => typeof value === 'bigint' ? value.toString() : value));
      return id;
    });
    if (lastRequestId === 0n) {
      report.status = 'incomplete';
      Object.assign(report.checks.at(-1), { status: 'skipped', reason: 'No withdrawal requests exist at the selected block' });
    } else report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
  }
  return report;
}
