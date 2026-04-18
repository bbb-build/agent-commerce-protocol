/**
 * Agent Commerce Protocol — Basic Usage Example
 *
 * This example demonstrates the complete lifecycle of a task:
 *
 *   1. An AI agent creates a task (LOCK) — depositing tokens into escrow
 *   2. A World ID-verified human registers as a worker and submits proof
 *   3. The AI agent reviews the submission and approves it (RELEASE)
 *   4. The worker receives their payout automatically
 *
 * This file is for illustration only; it won't run without a real
 * blockchain connection and funded wallet. Replace the placeholder
 * RPC URL and private key with real values to test on World Chain.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { worldchain } from 'viem/chains';
import {
  ACPClient,
  DEPLOYMENTS,
  WORLD_CHAIN_ID,
  TaskStatus,
  SubmissionStatus,
} from '@agent-commerce/sdk';

// ---------------------------------------------------------------------------
// Step 0: Set up viem clients
// ---------------------------------------------------------------------------

// In production, use a real RPC endpoint (e.g. Alchemy, Infura, or self-hosted)
const RPC_URL = 'https://worldchain-mainnet.g.alchemy.com/v2/YOUR_API_KEY';

// NEVER hardcode a private key in production code. Use env variables or a vault.
const AGENT_PRIVATE_KEY = '0xYOUR_AGENT_PRIVATE_KEY' as `0x${string}`;
const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: worldchain,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account: agentAccount,
  chain: worldchain,
  transport: http(RPC_URL),
});

// ---------------------------------------------------------------------------
// Step 1: Initialize the ACP client
// ---------------------------------------------------------------------------

// The SDK defaults to World Chain (chain ID 480) and the deployed
// HumanProofEscrowV2 contract address. No config needed for the happy path.
const acp = new ACPClient({
  publicClient,
  walletClient,
});

// Access deployment addresses through the tokens helper
console.log('USDC address:', acp.tokens.USDC);
console.log('WLD address:', acp.tokens.WLD);
console.log('Escrow address:', DEPLOYMENTS[WORLD_CHAIN_ID].escrow);

// ---------------------------------------------------------------------------
// Step 2: AI Agent creates a task (LOCK)
// ---------------------------------------------------------------------------

async function agentCreatesTask(): Promise<bigint> {
  // Define the task parameters:
  //   - Pay with USDC
  //   - Offer $5 per worker
  //   - Allow up to 10 workers
  //   - Deadline: 7 days from now
  const sevenDaysFromNow = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7);

  console.log('\n--- Agent: Creating a new task ---');
  console.log(`  Payment token: USDC (${acp.tokens.USDC})`);
  console.log(`  Reward per worker: $5.00`);
  console.log(`  Max workers: 10`);
  console.log(`  Deadline: ${new Date(Number(sevenDaysFromNow) * 1000).toISOString()}`);

  // Calculate the total cost (reward * workers + fees) before locking
  const totalCost = await acp.calculateTotalCost(
    acp.tokens.USDC,
    acp.parseUSDC(5),    // $5.00 in USDC smallest units (5_000_000)
    10,                   // 10 workers
  );
  console.log(`  Total cost (with fees): $${acp.formatUSDC(totalCost)}`);

  // lock() does two things automatically:
  //   1. Calls ERC-20 approve() if the current allowance is insufficient
  //   2. Calls createBounty() on the escrow contract
  // It returns the on-chain task ID (bountyId).
  const taskId = await acp.lock({
    paymentToken: acp.tokens.USDC,
    rewardPerWorker: acp.parseUSDC(5),
    maxWorkers: 10,
    deadline: sevenDaysFromNow,
  });

  console.log(`  Task created! On-chain ID: ${taskId}`);
  return taskId;
}

// ---------------------------------------------------------------------------
// Step 3: Query task state
// ---------------------------------------------------------------------------

async function checkTaskState(taskId: bigint): Promise<void> {
  console.log('\n--- Querying task state ---');

  const task = await acp.getTask(taskId);
  console.log(`  Agent: ${task.agent}`);
  console.log(`  Payment token: ${task.paymentToken}`);
  console.log(`  Reward per worker: $${acp.formatUSDC(task.rewardPerWorker)}`);
  console.log(`  Max workers: ${task.maxWorkers}`);
  console.log(`  Accepted workers: ${task.acceptedWorkers}`);
  console.log(`  Completed workers: ${task.completedWorkers}`);
  console.log(`  Total deposited: $${acp.formatUSDC(task.totalDeposited)}`);
  console.log(`  Status: ${TaskStatus[task.status]}`);

  // You can also check the total number of tasks on the contract
  const total = await acp.taskCount();
  console.log(`  Total tasks on contract: ${total}`);

  // Check fee structure for USDC
  const fees = await acp.getFeeBps(acp.tokens.USDC);
  console.log(`  Platform fee: ${fees.platformBps} bps`);
  console.log(`  Protocol fee: ${fees.protocolBps} bps`);
}

// ---------------------------------------------------------------------------
// Step 4: Check a worker's submission status
// ---------------------------------------------------------------------------

async function checkWorkerStatus(taskId: bigint, workerAddress: `0x${string}`): Promise<void> {
  console.log(`\n--- Checking worker ${workerAddress} ---`);

  const wt = await acp.getWorkerTask(taskId, workerAddress);
  console.log(`  Worker: ${wt.worker}`);
  console.log(`  Submission status: ${SubmissionStatus[wt.submissionStatus]}`);
  console.log(`  Submitted at: ${wt.submittedAt > 0n ? new Date(Number(wt.submittedAt) * 1000).toISOString() : 'N/A'}`);
  console.log(`  Paid: ${wt.paid}`);
}

// ---------------------------------------------------------------------------
// Step 5: Agent reviews and approves (RELEASE) or rejects
// ---------------------------------------------------------------------------

async function agentReviewsSubmission(
  taskId: bigint,
  workerAddress: `0x${string}`,
  approved: boolean,
): Promise<void> {
  if (approved) {
    console.log(`\n--- Agent: Approving submission from ${workerAddress} ---`);
    // release() calls approveSubmission() and waits for confirmation.
    // The escrowed funds are transferred to the worker automatically.
    const txHash = await acp.release(taskId, workerAddress);
    console.log(`  Approved! Tx: ${txHash}`);
  } else {
    console.log(`\n--- Agent: Rejecting submission from ${workerAddress} ---`);
    // reject() calls rejectSubmission(). The worker can resubmit.
    const txHash = await acp.reject(taskId, workerAddress);
    console.log(`  Rejected. Worker can resubmit. Tx: ${txHash}`);
  }
}

// ---------------------------------------------------------------------------
// Step 6: Reclaim unused funds (RECLAIM)
// ---------------------------------------------------------------------------

async function agentReclaimsFunds(taskId: bigint): Promise<void> {
  console.log('\n--- Agent: Reclaiming unused funds ---');

  // reclaim() is smart about which contract function to call:
  //   - If no workers accepted yet: calls cancelBounty() for a full refund
  //   - If deadline passed with unfilled slots: calls reclaimAfterDeadline()
  //   - If a specific worker address is given: calls reclaimForWorker()
  const txHash = await acp.reclaim(taskId);
  console.log(`  Reclaimed! Tx: ${txHash}`);
}

// ---------------------------------------------------------------------------
// Step 7: Auto-release after 3-day timeout
// ---------------------------------------------------------------------------

async function anyoneAutoReleases(taskId: bigint, workerAddress: `0x${string}`): Promise<void> {
  console.log(`\n--- Auto-releasing for ${workerAddress} (agent unresponsive for 3+ days) ---`);

  // autoRelease() calls autoApprove(). Anyone can call this if the agent
  // hasn't responded within 3 days of the worker's submission.
  // This protects workers from being ghosted.
  const txHash = await acp.autoRelease(taskId, workerAddress);
  console.log(`  Auto-released! Tx: ${txHash}`);
}

// ---------------------------------------------------------------------------
// Main — run the full flow
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Agent Commerce Protocol — Basic Usage ===\n');

  // In a real scenario, you would run these steps over time
  // as the task progresses through its lifecycle.

  // 1) Agent creates a task
  const taskId = await agentCreatesTask();

  // 2) Query the task
  await checkTaskState(taskId);

  // 3) (Off-chain) A human worker finds the task via the relay service,
  //    verifies with World ID, and submits their proof of work.
  //    The relayer calls registerWorker() and markSubmitted() on their behalf.
  const workerAddress = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;

  // 4) Agent checks the worker's submission
  await checkWorkerStatus(taskId, workerAddress);

  // 5) Agent approves the submission
  await agentReviewsSubmission(taskId, workerAddress, true);

  // 6) After all workers are done or deadline passes, reclaim leftovers
  await agentReclaimsFunds(taskId);

  console.log('\n=== Done ===');
}

main().catch(console.error);
