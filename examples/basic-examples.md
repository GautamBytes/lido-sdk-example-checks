---
sidebar_position: 2
---

# Basic Examples

Each block is an independent TypeScript module. Replace `<RPC_URL>` with a Hoodi
RPC endpoint. Read functions require only RPC access. Transaction functions also
require an EIP-1193 provider from your wallet connection flow and an authorized
account on Hoodi. Values are in wei. Importing these examples sends no requests;
call the exported functions explicitly from your application.

## Core example

```ts
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import { http, createPublicClient, type Address } from 'viem';
import { hoodi } from 'viem/chains';

const lidoSDK = new LidoSDK({
  chainId: hoodi.id,
  publicClient: createPublicClient({
    chain: hoodi,
    transport: http('<RPC_URL>'),
  }),
});

export async function readEthBalance(address: Address) {
  return lidoSDK.core.balanceETH(address); // bigint, in wei
}
```

## Stake example

```ts
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import {
  createWalletClient, custom, http, createPublicClient,
  type Address, type EIP1193Provider,
} from 'viem';
import { hoodi } from 'viem/chains';

const publicClient = createPublicClient({
  chain: hoodi,
  transport: http('<RPC_URL>'),
});

// Calling this function requests wallet approval and submits a transaction.
export async function stakeEth(
  provider: EIP1193Provider,
  account: Address,
  value: bigint,
) {
  const lidoSDK = new LidoSDK({
    chainId: hoodi.id,
    publicClient,
    walletClient: createWalletClient({
      chain: hoodi, account, transport: custom(provider),
    }),
  });
  const transaction = await lidoSDK.stake.stakeEth({ value, account });
  return transaction.result; // stethReceived and sharesReceived
}
```

## Withdraw example

```ts
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import {
  createWalletClient, custom, http, createPublicClient,
  type Address, type EIP1193Provider,
} from 'viem';
import { hoodi } from 'viem/chains';

const publicClient = createPublicClient({
  chain: hoodi,
  transport: http('<RPC_URL>'),
});
const lidoSDK = new LidoSDK({ chainId: hoodi.id, publicClient });

// Read-only: use request IDs returned by a withdrawal request.
export async function readWithdrawalStatus(requestsIds: bigint[]) {
  return lidoSDK.withdraw.views.getWithdrawalStatus({ requestsIds });
}

// Calling this function requests a permit signature and submits a transaction.
// amount must meet the protocol's current withdrawal bounds and wallet balance.
export async function requestWithdrawal(
  provider: EIP1193Provider,
  account: Address,
  amount: bigint,
) {
  const walletSDK = new LidoSDK({
    chainId: hoodi.id,
    publicClient,
    walletClient: createWalletClient({
      chain: hoodi, account, transport: custom(provider),
    }),
  });
  const transaction = await walletSDK.withdraw.request.requestWithdrawalWithPermit({
    amount, token: 'stETH', account,
  });
  if (!transaction.result) {
    throw new Error('Withdrawal receipt has no decoded request result');
  }
  return transaction.result.requests;
}
```

## Wrap example

```ts
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import {
  createWalletClient, custom, http, createPublicClient,
  type Address, type EIP1193Provider,
} from 'viem';
import { hoodi } from 'viem/chains';

const publicClient = createPublicClient({
  chain: hoodi,
  transport: http('<RPC_URL>'),
});
const lidoSDK = new LidoSDK({ chainId: hoodi.id, publicClient });

// Read-only: the wrap module exposes the wstETH contract getter.
export async function inspectWrapContract() {
  const contract = await lidoSDK.wrap.getContractWstETH();
  const stEthPerToken = await contract.read.stEthPerToken();
  return { address: contract.address, stEthPerToken };
}

// Calling this function requests wallet approval and submits a transaction.
export async function wrapEth(
  provider: EIP1193Provider,
  account: Address,
  value: bigint,
) {
  const walletSDK = new LidoSDK({
    chainId: hoodi.id,
    publicClient,
    walletClient: createWalletClient({
      chain: hoodi, account, transport: custom(provider),
    }),
  });
  const transaction = await walletSDK.wrap.wrapEth({ value, account });
  return transaction.result; // stethWrapped and wstethReceived
}
```
