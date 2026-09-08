import assert from 'node:assert/strict';
import { decodeFunctionData, parseAbi, zeroAddress } from 'viem';
import { WithdrawalQueueAbi } from '@lidofinance/lido-ethereum-sdk/withdraw';
import { HOODI_CONTRACTS } from './live-read.mjs';

export const VALUE = 1000000000000000n; // 0.001 test ETH per payable transaction
export const WITHDRAW_VALUE = 500000000000000n; // 0.0005 stETH
export const TX_CONTRACTS = Object.freeze({ ...HOODI_CONTRACTS,
  stETH: '0x3508a952176b3c15387c97be809eaffb1982176a',
  referralStaker: '0xf886bcc68b240316103fe8a12453ce7831c2e835',
});
const targets = { stake: TX_CONTRACTS.stETH, wrap: TX_CONTRACTS.referralStaker,
  withdraw: TX_CONTRACTS.withdrawalQueue, claim: TX_CONTRACTS.withdrawalQueue };
const abi = parseAbi(['function submit(address) payable returns (uint256)', 'function stakeETH(address) payable returns (uint256)']);
const sameAddress = (actual, expected) => assert.equal(actual?.toLowerCase(), expected.toLowerCase(), 'Unexpected address');

function checkDeadline(deadline) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  assert.ok(BigInt(deadline) > now && BigInt(deadline) <= now + 3600n, 'Permit must expire within one hour');
}

export function validateTransaction(transaction, step, owner, claimId) {
  assert.ok(Object.hasOwn(targets, step), 'Unknown transaction step');
  assert.equal(Number(transaction.chainId), 560048, 'Transactions are restricted to Hoodi');
  sameAddress(transaction.to, targets[step]);
  assert.equal(transaction.value ?? 0n, ['withdraw', 'claim'].includes(step) ? 0n : VALUE, 'Unexpected transaction value');
  assert.ok(transaction.gas > 0n && transaction.gas <= 1000000n, 'Gas limit exceeds test bounds');
  assert.ok(transaction.maxFeePerGas > 0n && transaction.maxFeePerGas <= 10000000000n, 'Fee cap exceeds test bounds');
  assert.ok(transaction.maxPriorityFeePerGas >= 0n && transaction.maxPriorityFeePerGas <= transaction.maxFeePerGas, 'Invalid priority fee');
  assert.ok(!transaction.authorizationList?.length && !transaction.blobs?.length, 'Unexpected transaction features');
  if (step === 'claim') {
    assert.ok(typeof claimId === 'bigint' && claimId > 0n, 'Claim requires a specific request ID');
    const { functionName, args } = decodeFunctionData({ abi: WithdrawalQueueAbi, data: transaction.data });
    assert.equal(functionName, 'claimWithdrawals');
    assert.deepEqual(args[0], [claimId]);
    assert.equal(args[1].length, 1, 'Expected one checkpoint hint');
  } else if (step === 'withdraw') {
    const { functionName, args } = decodeFunctionData({ abi: WithdrawalQueueAbi, data: transaction.data });
    assert.equal(functionName, 'requestWithdrawalsWithPermit');
    assert.deepEqual(args[0], [WITHDRAW_VALUE]);
    sameAddress(args[1], owner);
    assert.equal(args[2].value, WITHDRAW_VALUE);
    checkDeadline(args[2].deadline);
  } else {
    const { functionName, args } = decodeFunctionData({ abi, data: transaction.data });
    assert.equal(functionName, step === 'stake' ? 'submit' : 'stakeETH');
    sameAddress(args[0], zeroAddress);
  }
}

export function validatePermit(typedData, owner) {
  assert.equal(Number(typedData.domain.chainId), 560048);
  sameAddress(typedData.domain.verifyingContract, TX_CONTRACTS.stETH);
  assert.equal(typedData.primaryType, 'Permit');
  sameAddress(typedData.message.owner, owner);
  sameAddress(typedData.message.spender, TX_CONTRACTS.withdrawalQueue);
  assert.equal(BigInt(typedData.message.value), WITHDRAW_VALUE);
  checkDeadline(typedData.message.deadline);
}

export function checkReceipt(transaction, step, owner) {
  assert.ok(transaction.receipt && transaction.result, 'Expected a mined receipt and decoded SDK result');
  assert.equal(transaction.receipt.status, 'success', 'Transaction reverted');
  assert.equal(transaction.receipt.transactionHash, transaction.hash, 'Receipt hash mismatch');
  sameAddress(transaction.receipt.from, owner);
  sameAddress(transaction.receipt.to, targets[step]);
}

export function claimReadiness(status, expected) {
  assert.equal(status.id, expected.id, 'Withdrawal ID mismatch');
  sameAddress(status.owner, expected.owner);
  assert.equal(status.amountOfStETH, expected.amountOfStETH, 'Withdrawal amount mismatch');
  if (status.isClaimed) return 'already-claimed';
  return status.isFinalized ? 'ready' : 'awaiting-finalization';
}

export function checkClaimResult(transaction, status, owner, id, before, after) {
  checkReceipt(transaction, 'claim', owner);
  assert.equal(transaction.result.requests.length, 1, 'Expected one decoded claim event');
  const event = transaction.result.requests[0];
  assert.equal(event.requestId, id, 'Claim event ID mismatch');
  sameAddress(event.owner, owner);
  sameAddress(event.receiver, owner);
  assert.ok(event.amountOfETH > 0n, 'Claim must return ETH');
  assert.equal(status.id, id);
  sameAddress(status.owner, owner);
  assert.equal(status.isClaimed, true, 'Request must be marked claimed on-chain');
  assert.equal(status.isFinalized, true, 'Request must be finalized');
  const gasCost = transaction.receipt.gasUsed * transaction.receipt.effectiveGasPrice;
  assert.equal(after - before + gasCost, event.amountOfETH, 'ETH balance change plus gas must match claimed ETH');
}
