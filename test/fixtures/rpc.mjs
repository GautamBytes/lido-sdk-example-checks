import assert from 'node:assert/strict';
import { custom, decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
import { LidoLocatorAbi } from '@lidofinance/lido-ethereum-sdk/core';
import { WithdrawalQueueAbi } from '@lidofinance/lido-ethereum-sdk/withdraw';

// The locator is the pinned SDK's Hoodi locator. Other addresses and data are synthetic.
export const LOCATOR = '0xe2ef9536daaaebff5b1c130957ab3e80056b06d8';
export const OWNER = '0x0000000000000000000000000000000000000011';
export const WSTETH = '0x0000000000000000000000000000000000000022';
export const QUEUE = '0x0000000000000000000000000000000000000033';
const rateAbi = parseAbi(['function stEthPerToken() view returns (uint256)']);

export function createRpcFixture({ failReads = false, malformedStatus = false, wrongStatusCount = false } = {}) {
  const requests = [];
  const statuses = [
    { amountOfStETH: 10n ** 18n, amountOfShares: 9n * 10n ** 17n, owner: OWNER,
      timestamp: 1_700_000_000n, isFinalized: false, isClaimed: false },
    { amountOfStETH: 2n * 10n ** 18n, amountOfShares: 18n * 10n ** 17n, owner: OWNER,
      timestamp: 1_700_000_001n, isFinalized: true, isClaimed: false },
    { amountOfStETH: 3n * 10n ** 18n, amountOfShares: 27n * 10n ** 17n, owner: OWNER,
      timestamp: 1_700_000_002n, isFinalized: true, isClaimed: true },
  ];
  async function request({ method, params }) {
    requests.push({ method, params });
    if (method !== 'eth_getBalance' && method !== 'eth_call') {
      throw new Error(`Unexpected RPC method: ${method}`);
    }
    if (failReads) throw new Error('Fixture RPC unavailable');
    if (method === 'eth_getBalance') {
      assert.deepEqual(params, [OWNER, 'latest']);
      return '0xde0b6b3a7640000';
    }
    assert.equal(params.length, 2);
    const [call, block] = params;
    assert.equal(block, 'latest');
    const address = call.to.toLowerCase();
    if (address === LOCATOR) {
      const decoded = decodeFunctionData({ abi: LidoLocatorAbi, data: call.data });
      assert.ok(['wstETH', 'withdrawalQueue'].includes(decoded.functionName), 'unexpected locator read');
      assert.ok(!decoded.args || decoded.args.length === 0);
      return encodeFunctionResult({ abi: LidoLocatorAbi, functionName: decoded.functionName,
        result: decoded.functionName === 'wstETH' ? WSTETH : QUEUE });
    }
    if (address === WSTETH) {
      const decoded = decodeFunctionData({ abi: rateAbi, data: call.data });
      assert.equal(decoded.functionName, 'stEthPerToken');
      return encodeFunctionResult({ abi: rateAbi, functionName: 'stEthPerToken', result: 112n * 10n ** 16n });
    }
    if (address === QUEUE) {
      const decoded = decodeFunctionData({ abi: WithdrawalQueueAbi, data: call.data });
      assert.equal(decoded.functionName, 'getWithdrawalStatus');
      const selected = decoded.args[0].map((id) => {
        assert.ok(id >= 41n && id <= 43n, 'unknown fixture request ID');
        return statuses[Number(id - 41n)];
      });
      if (malformedStatus) return '0x';
      return encodeFunctionResult({ abi: WithdrawalQueueAbi, functionName: 'getWithdrawalStatus',
        result: wrongStatusCount ? [] : selected });
    }
    throw new Error(`Unexpected RPC destination: ${address}`);
  }
  return { requests, statuses, request, transport: custom({ request }, { retryCount: 0 }) };
}
