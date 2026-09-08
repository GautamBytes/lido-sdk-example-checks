import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import { createPublicClient, http } from 'viem';
import { hoodi } from 'viem/chains';

// Construction makes no RPC requests. Supply a Hoodi RPC URL before making reads.
const publicClient = createPublicClient({
  chain: hoodi,
  transport: http('https://rpc.invalid'),
});

const sdk = new LidoSDK({
  chainId: hoodi.id,
  publicClient,
});

console.log(`SDK initialized: ${sdk.core.chain.name} (${sdk.core.chainId})`);
console.log('No RPC requests made; no wallet required.');
