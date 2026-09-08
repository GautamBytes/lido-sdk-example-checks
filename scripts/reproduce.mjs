import assert from 'node:assert/strict';
import { snippet, execute, initializationContext } from '../test/snippets.mjs';

const original = await snippet('evidence/upstream/README.md', '## Initialization');
await assert.rejects(execute(initializationContext + original), (error) => {
  assert.match(error.message,
    /publicClient chain id 560048 does not match provided chain id 17000/);
  console.log(`BEFORE: ${error.code}: ${error.message}`);
  return true;
});

const corrected = await snippet('examples/README.md', '## Initialization');
const { sdk } = await execute(initializationContext + corrected + '\nexport { sdk };');
assert.equal(sdk.core.chainId, 560048);
console.log(`AFTER: initialized ${sdk.core.chain.name}; SDK/client chain IDs agree (${sdk.core.chainId})`);
console.log('Verified locally with the real SDK. No RPC requests or transactions.');
