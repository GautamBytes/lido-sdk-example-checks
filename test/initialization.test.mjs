import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snippet, execute } from './snippets.mjs';

async function initialize(heading, index, exports) {
  const code = await snippet('examples/usage.md', heading, index);
  const context = `
    import { custom as fixtureCustom } from 'viem';
    export const requests = [];
    export const provider = { request: async (request) => {
      requests.push(request);
      throw new Error('Unexpected provider access during initialization');
    } };
    const fixtureTransport = fixtureCustom(provider, { retryCount: 0 });
  `;
  return execute(context + code.replace("http('<RPC_URL>')", 'fixtureTransport') + exports);
}

test('public-client documentation initializes without a wallet or RPC call', async () => {
  const { sdk, requests } = await initialize('## Initialization', 0, '\nexport { sdk };');
  assert.equal(sdk.core.chainId, 560048);
  assert.equal(sdk.core.walletClient, undefined);
  assert.deepEqual(requests, []);
});

test('RPC-URL documentation constructs the client without fetching', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
  const { sdk } = await initialize('## Initialization', 1, '\nexport { sdk };');
  assert.equal(sdk.core.publicClient.chain.id, 560048);
  assert.equal(fetch.mock.callCount(), 0);
});

test('wallet documentation accepts an explicit provider without prompting it', async () => {
  const { createWalletSdk, provider, requests } = await initialize('## With walletClient', 0, '');
  const sdk = createWalletSdk(provider);
  assert.equal(sdk.core.walletClient.chain.id, 560048);
  assert.equal(sdk.core.chainId, 560048);
  assert.deepEqual(requests, []);
});

test('separate-module documentation constructs and shares the same core', async () => {
  const { core, stake, wrap, requests } = await initialize('## Separate modules', 0, '\nexport { core, stake, wrap };');
  assert.equal(core.chainId, 560048);
  assert.equal(stake.core.chainId, 560048);
  assert.equal(wrap.core, core);
  assert.deepEqual(requests, []);
});
