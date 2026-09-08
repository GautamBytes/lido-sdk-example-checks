import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, parseAbi, zeroAddress } from 'viem';
import { WithdrawalQueueAbi } from '@lidofinance/lido-ethereum-sdk/withdraw';
import { TX_CONTRACTS, VALUE, WITHDRAW_VALUE, validateTransaction, validatePermit, checkReceipt,
  claimReadiness, checkClaimResult } from '../scripts/lib/transaction-policy.mjs';

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

test('claim signing allows only the specified request and sends no ETH', () => {
  const encode = (ids) => encodeFunctionData({ abi: WithdrawalQueueAbi,
    functionName: 'claimWithdrawals', args: [ids, ids.map(() => 1n)] });
  const claim = { ...tx, to: TX_CONTRACTS.withdrawalQueue, value: 0n, data: encode([5019n]) };
  assert.doesNotThrow(() => validateTransaction(claim, 'claim', owner, 5019n));
  assert.throws(() => validateTransaction({ ...claim, value: 1n }, 'claim', owner, 5019n));
  assert.throws(() => validateTransaction({ ...claim, data: encode([5020n]) }, 'claim', owner, 5019n));
  assert.throws(() => validateTransaction({ ...claim, data: encode([5019n, 5020n]) }, 'claim', owner, 5019n));
  assert.throws(() => validateTransaction(claim, 'claim', owner));
});

test('claim readiness distinguishes pending and already-claimed requests from ready ones', () => {
  const expected = { id: 5019n, owner, amountOfStETH: WITHDRAW_VALUE };
  const status = { ...expected, isFinalized: false, isClaimed: false };
  assert.equal(claimReadiness(status, expected), 'awaiting-finalization');
  assert.equal(claimReadiness({ ...status, isFinalized: true }, expected), 'ready');
  assert.equal(claimReadiness({ ...status, isFinalized: true, isClaimed: true }, expected), 'already-claimed');
  assert.throws(() => claimReadiness({ ...status, owner: zeroAddress }, expected));
  assert.throws(() => claimReadiness({ ...status, id: 5020n }, expected));
  assert.throws(() => claimReadiness({ ...status, amountOfStETH: 1n }, expected));
});

test('claim evidence requires a matching event, claimed state, and ETH received after accounting for gas', () => {
  const hash = `0x${'ab'.repeat(32)}`;
  const transaction = { hash, receipt: { status: 'success', transactionHash: hash, from: owner,
    to: TX_CONTRACTS.withdrawalQueue, gasUsed: 100n, effectiveGasPrice: 2n },
    result: { requests: [{ requestId: 5019n, owner, receiver: owner, amountOfETH: 500n }] } };
  const status = { id: 5019n, owner, isClaimed: true, isFinalized: true };
  assert.doesNotThrow(() => checkClaimResult(transaction, status, owner, 5019n, 1000n, 1300n));
  assert.throws(() => checkClaimResult(transaction, status, owner, 5019n, 1000n, 1301n));
  assert.throws(() => checkClaimResult(transaction, { ...status, isClaimed: false }, owner, 5019n, 1000n, 1300n));
  assert.throws(() => checkClaimResult({ ...transaction, result: { requests: [] } }, status, owner, 5019n, 1000n, 1300n));
  assert.throws(() => checkClaimResult(transaction, status, owner, 5020n, 1000n, 1300n));
});
