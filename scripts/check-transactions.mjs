import assert from 'node:assert/strict';
import { mkdir, open, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LidoSDK } from '@lidofinance/lido-ethereum-sdk';
import { createPublicClient, createWalletClient, http, keccak256, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hoodi } from 'viem/chains';
import { TX_CONTRACTS, VALUE, WITHDRAW_VALUE, validateTransaction, validatePermit, checkReceipt } from './lib/transaction-policy.mjs';
import { digestFiles, gitIdentity } from './lib/sdk-build.mjs';

const help = 'Usage: npm run check:transactions -- [--execute] [--output reports/hoodi-transactions.json]\nHOODI_WALLET_FILE must name a mode-600 test key file outside this repository. Default: preflight only.';
let execute = false, output;
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') { console.log(help); process.exit(0); }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--execute' && !execute) execute = true;
  else if (args[i] === '--output' && !output && args[i + 1]?.endsWith('.json') && !args[i + 1].startsWith('--')) output = args[++i];
  else { console.error(help); process.exit(2); }
}
output = resolve(output ?? `reports/hoodi-${execute ? 'transactions' : 'preflight'}.json`);
const root = fileURLToPath(new URL('..', import.meta.url));
const report = { schemaVersion: 1, mode: execute ? 'hoodi-transactions' : 'hoodi-preflight',
  generatedAt: new Date().toISOString(), status: 'running', chainId: hoodi.id, transactions: [],
  limits: { stakeWei: VALUE.toString(), wrapWei: VALUE.toString(), withdrawalStETH: WITHDRAW_VALUE.toString() },
  claim: { status: 'not-tested' },
};
const json = (value) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
async function save() {
  await writeFile(`${output}.tmp`, json(report), { mode: 0o600 });
  await rename(`${output}.tmp`, output);
}
try {
  await mkdir(dirname(output), { recursive: true });
  await (await open(output, 'wx', 0o600)).close();
} catch {
  console.error('Output already exists or cannot be created. Preserve prior evidence and choose a new output path.');
  process.exit(1);
}
try {
  assert.ok(process.env.HOODI_WALLET_FILE, 'Set HOODI_WALLET_FILE to a dedicated test key file');
  const keyPath = await realpath(process.env.HOODI_WALLET_FILE);
  const pathFromRoot = relative(root, keyPath);
  assert.ok(isAbsolute(pathFromRoot) || pathFromRoot.startsWith('../'), 'Test key must be outside the repository');
  const keyStat = await stat(keyPath);
  assert.ok(keyStat.isFile() && (keyStat.mode & 0o077) === 0, 'Test key file must have owner-only permissions');
  let account;
  try { account = privateKeyToAccount((await readFile(keyPath, 'utf8')).trim()); }
  catch { throw new Error('Could not load the test wallet key'); }
  report.account = account.address;
  const rpcUrl = process.env.HOODI_RPC_URL ?? 'https://rpc.hoodi.ethpandaops.io';
  const client = createPublicClient({ chain: hoodi, transport: http(rpcUrl, { retryCount: 0, timeout: 10000 }) });
  assert.equal(await client.getChainId(), hoodi.id, 'RPC must be Hoodi');
  const sdkRead = new LidoSDK({ chainId: hoodi.id, publicClient: client });
  const contracts = { locator: sdkRead.core.getContractLidoLocator().address,
    stETH: (await sdkRead.core.getLidoContract()).address,
    wstETH: (await sdkRead.wrap.getContractWstETH()).address,
    referralStaker: (await sdkRead.wrap.getContractWstETHReferralStaker()).address,
    withdrawalQueue: (await sdkRead.withdraw.contract.getContractWithdrawalQueue()).address };
  for (const [name, address] of Object.entries(contracts)) {
    assert.equal(address.toLowerCase(), TX_CONTRACTS[name], `${name} differs from the reviewed deployment`);
    const code = await client.getCode({ address });
    assert.ok(code && code !== '0x', `${name} has no bytecode`);
  }
  report.contracts = contracts;
  report.startBalanceWei = await client.getBalance({ address: account.address });
  assert.ok(report.startBalanceWei >= 35000000000000000n, 'Fund the test wallet with at least 0.035 Hoodi ETH');
  assert.ok(!(await client.getCode({ address: account.address })), 'Use a fresh EOA, not a contract or delegated wallet');
  report.project = gitIdentity(root);
  report.sdkVersion = JSON.parse(await readFile(join(root, 'node_modules/@lidofinance/lido-ethereum-sdk/package.json'), 'utf8')).version;
  report.checkerDigest = await digestFiles(root, ['scripts/check-transactions.mjs', 'scripts/lib/transaction-policy.mjs', 'scripts/lib/live-read.mjs']);
  report.lockfileDigest = await digestFiles(root, ['package-lock.json']);
  report.preflight = 'passed';
  await save();
  if (execute) {
    const tokenAbi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function sharesOf(address) view returns (uint256)']);
    const balance = (address, functionName = 'balanceOf') => client.readContract({ address, abi: tokenAbi, functionName, args: [account.address] });
    for (const step of ['stake', 'wrap', 'withdraw']) {
      const record = { step, status: 'preparing' };
      report.transactions.push(record);
      await save();
      const before = await balance(step === 'wrap' ? contracts.wstETH : contracts.stETH, step === 'wrap' ? 'balanceOf' : 'sharesOf');
      let signed = false;
      const guardedAccount = { ...account,
        async signTransaction(transaction, options) {
          assert.ok(!signed, 'Only one transaction may be signed per step');
          validateTransaction(transaction, step, account.address);
          const serialized = await account.signTransaction(transaction, options);
          signed = true;
          record.signedHash = keccak256(serialized);
          record.status = 'signed';
          await save(); // Keep the hash even if broadcast returns an ambiguous network error.
          return serialized;
        },
        async signTypedData(data) {
          assert.equal(step, 'withdraw', 'Permit signing is restricted to the withdrawal step');
          validatePermit(data, account.address);
          return account.signTypedData(data);
        },
        async signMessage() { throw new Error('Message signing is disabled'); },
        async signAuthorization() { throw new Error('Authorization signing is disabled'); },
      };
      const walletClient = createWalletClient({ chain: hoodi, account: guardedAccount, transport: http(rpcUrl, { retryCount: 0, timeout: 10000 }) });
      const sdk = new LidoSDK({ chainId: hoodi.id, publicClient: client, walletClient });
      const callback = async ({ stage, payload }) => {
        if (stage === 'receipt') {
          record.hash = payload;
          record.status = 'broadcast';
          await save();
          console.log(`${step}: ${payload}`);
        }
      };
      // Omit the account string so the SDK retains the guarded local signer.
      const transaction = step === 'stake' ? await sdk.stake.stakeEth({ value: VALUE, callback })
        : step === 'wrap' ? await sdk.wrap.wrapEth({ value: VALUE, callback })
        : await sdk.withdraw.request.requestWithdrawalWithPermit({ amount: WITHDRAW_VALUE, token: 'stETH',
          deadline: BigInt(Math.floor(Date.now() / 1000) + 1800), callback });
      record.hash = transaction.hash;
      checkReceipt(transaction, step, account.address);
      record.receipt = { blockNumber: transaction.receipt.blockNumber, blockHash: transaction.receipt.blockHash,
        status: transaction.receipt.status, gasUsed: transaction.receipt.gasUsed, effectiveGasPrice: transaction.receipt.effectiveGasPrice };
      record.result = transaction.result;
      const after = await balance(step === 'wrap' ? contracts.wstETH : contracts.stETH, step === 'wrap' ? 'balanceOf' : 'sharesOf');
      record.balanceCheck = { unit: step === 'wrap' ? 'wstETH base units' : 'stETH shares', before, after };
      if (step === 'wrap') assert.equal(after - before, transaction.result.wstethReceived, 'wstETH balance change must match SDK result');
      else if (step === 'stake') assert.ok(after > before && transaction.result.sharesReceived > 0n, 'Stake must increase stETH shares');
      else {
        assert.ok(after < before, 'Withdrawal must consume stETH shares');
        assert.equal(transaction.result.requests.length, 1, 'Expected one withdrawal request');
        const id = transaction.result.requests[0].requestId;
        const [status] = await sdk.withdraw.views.getWithdrawalStatus({ requestsIds: [id] });
        assert.equal(status.owner.toLowerCase(), account.address.toLowerCase(), 'Withdrawal owner mismatch');
        assert.equal(status.amountOfStETH, WITHDRAW_VALUE, 'Withdrawal amount mismatch');
        report.withdrawal = status;
        report.claim = { status: status.isFinalized ? 'ready-not-tested' : 'awaiting-finalization', requestId: id };
      }
      record.status = 'passed';
      await save();
      console.log(`PASSED: ${step}`);
    }
    report.endBalanceWei = await client.getBalance({ address: account.address });
    report.status = 'passed';
  } else report.status = 'preflight-passed';
} catch (error) {
  report.status = 'failed';
  // SDK/RPC errors may include endpoint credentials or signed payloads.
  report.error = error instanceof assert.AssertionError ? error.message : 'Wallet, SDK, or RPC operation failed; inspect recorded hashes before retrying';
  const last = report.transactions.at(-1);
  if (last && last.status !== 'passed') last.failure = 'Step incomplete; signed/broadcast hashes may already be on-chain';
  process.exitCode = 1;
} finally {
  await save();
  console.log(`${report.status}: ${output}`);
}
