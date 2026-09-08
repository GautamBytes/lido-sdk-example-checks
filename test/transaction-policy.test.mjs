import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, parseAbi, zeroAddress } from 'viem';
import { WithdrawalQueueAbi } from '@lidofinance/lido-ethereum-sdk/withdraw';
import { TX_CONTRACTS, VALUE, WITHDRAW_VALUE, validateTransaction, validatePermit, checkReceipt } from '../scripts/lib/transaction-policy.mjs';

const owner = '0x0000000000000000000000000000000000000011';
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
const stakeData = encodeFunctionData({ abi: parseAbi(['function submit(address) payable returns (uint256)']), functionName: 'submit', args: [zeroAddress] });
const tx = { chainId: 560048, to: TX_CONTRACTS.stETH, value: VALUE, data: stakeData,
  gas: 300000n, maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n };
const permit = { domain: { chainId: 560048n, verifyingContract: TX_CONTRACTS.stETH }, primaryType: 'Permit',
  message: { owner, spender: TX_CONTRACTS.withdrawalQueue, value: WITHDRAW_VALUE, deadline } };

test('transaction policy accepts the bounded Hoodi staking call', () => {
  assert.doesNotThrow(() => validateTransaction(tx, 'stake', owner));
});

test('transaction policy blocks wrong chains, destinations, values, calldata, and excessive fees', () => {
  for (const mutation of [
    { chainId: 1 }, { to: owner }, { value: VALUE + 1n }, { data: '0x' },
    { gas: 1000001n }, { maxFeePerGas: 10000000001n }, { maxPriorityFeePerGas: 10000000001n },
  ]) assert.throws(() => validateTransaction({ ...tx, ...mutation }, 'stake', owner));
});

test('wrapping is restricted to the reviewed referral staker and zero referral', () => {
  const data = encodeFunctionData({ abi: parseAbi(['function stakeETH(address) payable returns (uint256)']), functionName: 'stakeETH', args: [zeroAddress] });
  const wrap = { ...tx, to: TX_CONTRACTS.referralStaker, data };
  assert.doesNotThrow(() => validateTransaction(wrap, 'wrap', owner));
  assert.throws(() => validateTransaction(wrap, 'stake', owner));
});

test('withdrawal calldata restricts the receiver, token amount, and permit value', () => {
  const encode = (receiver, amount = WITHDRAW_VALUE) => encodeFunctionData({ abi: WithdrawalQueueAbi,
    functionName: 'requestWithdrawalsWithPermit', args: [[amount], receiver,
      { value: amount, deadline, v: 27, r: `0x${'00'.repeat(32)}`, s: `0x${'00'.repeat(32)}` }],
  });
  const withdrawal = { ...tx, to: TX_CONTRACTS.withdrawalQueue, value: 0n, data: encode(owner) };
  assert.doesNotThrow(() => validateTransaction(withdrawal, 'withdraw', owner));
  assert.throws(() => validateTransaction({ ...withdrawal, data: encode(zeroAddress) }, 'withdraw', owner));
  assert.throws(() => validateTransaction({ ...withdrawal, data: encode(owner, WITHDRAW_VALUE + 1n) }, 'withdraw', owner));
});

test('permit signing is restricted to Hoodi stETH and the exact withdrawal amount', () => {
  assert.doesNotThrow(() => validatePermit(permit, owner));
  for (const mutation of [
    { domain: { ...permit.domain, chainId: 1 } },
    { domain: { ...permit.domain, verifyingContract: owner } },
    { primaryType: 'Other' },
    { message: { ...permit.message, spender: owner } },
    { message: { ...permit.message, value: 2n ** 256n - 1n } },
    { message: { ...permit.message, deadline: 2n ** 256n - 1n } },
  ]) assert.throws(() => validatePermit({ ...permit, ...mutation }, owner));
});

test('receipts require success, the matching hash, sender and destination', () => {
  const hash = `0x${'ab'.repeat(32)}`;
  const transaction = { hash, result: {}, receipt: { status: 'success', transactionHash: hash, from: owner, to: TX_CONTRACTS.stETH } };
  assert.doesNotThrow(() => checkReceipt(transaction, 'stake', owner));
  for (const mutation of [{ status: 'reverted' }, { transactionHash: `0x${'cd'.repeat(32)}` }, { from: zeroAddress }, { to: owner }]) {
    assert.throws(() => checkReceipt({ ...transaction, receipt: { ...transaction.receipt, ...mutation } }, 'stake', owner));
  }
  assert.throws(() => checkReceipt({ hash }, 'stake', owner));
});
