import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, custom } from 'viem';
import { hoodi, mainnet } from 'viem/chains';
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import { snippet, execute, initializationContext } from './snippets.mjs';

test('original README initialization reproduces the network mismatch', async () => {
  const code = await snippet('evidence/upstream/README.md', '## Initialization');
  await assert.rejects(execute(initializationContext + code),
    /publicClient chain id 560048 does not match provided chain id 17000/);
});

test('corrected README second initialization uses the same client network', async () => {
  const code = (await snippet('examples/README.md', '## Examples')).split('// Views')[0];
  const context = `
    import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
    import { createPublicClient, http } from 'viem';
    import { hoodi } from 'viem/chains';
    const publicClient = createPublicClient({ chain: hoodi, transport: http('https://rpc.invalid') });
    const walletClient = undefined;
  `;
  const { lidoSDK } = await execute(context + code + '\nexport { lidoSDK };');
  assert.equal(lidoSDK.core.chainId, hoodi.id);
});

test('corrected initialization and balance read use actual SDK and viem with fixture RPC', async () => {
  let code = await snippet('examples/README.md', '## Initialization');
  // Replace only the remote RPC boundary. SDK and viem remain unmocked.
  assert.equal(code.split("http('<RPC_URL>')").length, 2);
  code = code.replace("http('<RPC_URL>')", 'fixtureTransport');
  const context = initializationContext + `
    import { custom } from 'viem';
    export const requests = [];
    const fixtureTransport = custom({ request: async (request) => {
      requests.push(request);
      if (request.method === 'eth_getBalance') return '0xde0b6b3a7640000';
      throw new Error('Unexpected RPC: ' + request.method);
    } }, { retryCount: 0 });
  `;
  const { sdk, requests } = await execute(context + code + '\nexport { sdk };');
  assert.deepEqual(requests, [], 'initialization must not make RPC requests');
  const address = '0x0000000000000000000000000000000000000001';
  assert.equal(await sdk.core.balanceETH(address), 1_000_000_000_000_000_000n);
  assert.deepEqual(requests, [{ method: 'eth_getBalance', params: [address, 'latest'] }]);
});

test('corrected README initialization constructs a Hoodi SDK', async () => {
  const code = await snippet('examples/README.md', '## Initialization');
  const { sdk } = await execute(initializationContext + code + '\nexport { sdk };');
  assert.equal(sdk.core.chainId, hoodi.id);
  assert.equal(sdk.core.publicClient.chain.id, hoodi.id);
  assert.equal(sdk.core.walletClient, undefined);
});

test('SDK already rejects two supported but different client/SDK networks', () => {
  const publicClient = createPublicClient({
    chain: hoodi,
    transport: custom({ request: async () => { throw new Error('Unexpected RPC'); } }),
  });
  assert.throws(() => new LidoSDK({ publicClient, chainId: mainnet.id, logMode: 'none' }),
    /publicClient chain id 560048 does not match provided chain id 1/);
});

test('documented Core import reproduces missing hoodi export from viem', async () => {
  const code = await snippet('evidence/upstream/basic-examples.md', '## Core example');
  // Module linking happens before undefined address or any RPC could be reached.
  await assert.rejects(execute(code), /does not provide an export named 'hoodi'/);
});

test('documented wrapping getter is absent from the withdrawal module', async () => {
  const code = await snippet('evidence/upstream/basic-examples.md', '## Wrap example');
  assert.match(code, /lidoSDK\.withdraw\.getContractWstETH\(\)/);
  const publicClient = createPublicClient({
    chain: hoodi,
    transport: custom({ request: async () => { throw new Error('Unexpected RPC'); } }),
  });
  const lidoSDK = new LidoSDK({ publicClient, logMode: 'none' });
  // Isolate the documented call so the earlier import/chain errors cannot mask it.
  assert.throws(() => lidoSDK.withdraw.getContractWstETH(), /is not a function/);
  assert.equal(typeof lidoSDK.wrap.getContractWstETH, 'function');
});

test('snippet selection fails loudly if the documentation structure changes', async () => {
  await assert.rejects(snippet('evidence/upstream/README.md', '## Missing heading'),
    /Missing TypeScript snippet/);
});
