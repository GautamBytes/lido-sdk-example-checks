import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snippet, execute } from './snippets.mjs';
import { OWNER, LOCATOR, WSTETH, QUEUE, createRpcFixture } from './fixtures/rpc.mjs';

async function loadExample(heading, options = {}) {
  const code = await snippet('examples/basic-examples.md', heading);
  assert.equal(code.split("http('<RPC_URL>')").length, 2);
  const context = `
    import { createRpcFixture } from ${JSON.stringify(new URL('./fixtures/rpc.mjs', import.meta.url).href)};
    export const fixture = createRpcFixture(${JSON.stringify(options)});
    const fixtureTransport = fixture.transport;
  `;
  const example = await execute(context + code.replace("http('<RPC_URL>')", 'fixtureTransport'));
  assert.deepEqual(example.fixture.requests, [], 'loading an example must not contact a provider');
  return example;
}

test('Core snippet reads an ETH balance through the actual SDK', async () => {
  const example = await loadExample('## Core example');
  assert.equal(await example.readEthBalance(OWNER), 10n ** 18n);
  assert.deepEqual(example.fixture.requests, [{ method: 'eth_getBalance', params: [OWNER, 'latest'] }]);
});

test('changing the Core snippet to a different supported SDK chain is rejected', async () => {
  const code = await snippet('examples/basic-examples.md', '## Core example');
  assert.match(code, /chainId: hoodi\.id/);
  const mutated = code.replace('chainId: hoodi.id', 'chainId: 1');
  await assert.rejects(execute(mutated), /publicClient chain id 560048 does not match provided chain id 1/);
});

test('Wrap snippet resolves the locator, creates the contract, and decodes its rate', async () => {
  const example = await loadExample('## Wrap example');
  assert.deepEqual(await example.inspectWrapContract(), { address: WSTETH, stEthPerToken: 112n * 10n ** 16n });
  // SDK cache-key evaluation may repeat locator reads; do not assert an RPC count contract.
  assert.deepEqual([...new Set(example.fixture.requests.map((r) => r.params[0].to.toLowerCase()))], [LOCATOR, WSTETH]);
});

test('Withdraw snippet preserves request IDs and pending/finalized/claimed states', async () => {
  const example = await loadExample('## Withdraw example');
  const ids = [43n, 41n, 42n];
  const results = await example.readWithdrawalStatus(ids);
  assert.deepEqual(results, [2, 0, 1].map((index, position) => ({
    ...example.fixture.statuses[index], id: ids[position], stringId: ids[position].toString(),
  })));
  assert.deepEqual([...new Set(example.fixture.requests.map((r) => r.params[0].to.toLowerCase()))], [LOCATOR, QUEUE]);
});

test('Withdraw snippet handles an empty request list', async () => {
  const example = await loadExample('## Withdraw example');
  assert.deepEqual(await example.readWithdrawalStatus([]), []);
});

test('Withdraw snippet rejects malformed ABI data and mismatched result counts', async () => {
  const malformed = await loadExample('## Withdraw example', { malformedStatus: true });
  await assert.rejects(malformed.readWithdrawalStatus([41n]));
  const wrongCount = await loadExample('## Withdraw example', { wrongStatusCount: true });
  await assert.rejects(wrongCount.readWithdrawalStatus([41n]), /Invalid requests ids/);
});

test('read failures propagate to the caller instead of becoming fake success', async () => {
  const example = await loadExample('## Core example', { failReads: true });
  await assert.rejects(example.readEthBalance(OWNER), /Fixture RPC unavailable/);
});

test('Stake snippet can be imported without requesting a wallet or sending a transaction', async () => {
  const example = await loadExample('## Stake example');
  assert.equal(typeof example.stakeEth, 'function');
  assert.deepEqual(example.fixture.requests, []);
});

test('fixture rejects signing, broadcasts, and unknown read destinations', async () => {
  const fixture = createRpcFixture();
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_signTypedData_v4', 'personal_sign']) {
    await assert.rejects(fixture.request({ method, params: [] }), /Unexpected RPC method/);
  }
  await assert.rejects(fixture.request({ method: 'eth_call', params: [{ to: OWNER, data: '0x' }, 'latest'] }),
    /Unexpected RPC destination/);
});
