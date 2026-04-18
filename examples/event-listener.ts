/**
 * Agent Commerce Protocol — Event Listener Example
 *
 * This example shows how to listen for real-time events emitted
 * by the HumanProofEscrowV2 escrow contract on World Chain.
 *
 * Two approaches are demonstrated:
 *   1. Real-time watching using WebSocket subscriptions (watchTaskCreated, watchApproved)
 *   2. Historical log fetching using viem's getContractEvents
 *
 * Use case: A monitoring service or dashboard that reacts to
 * on-chain task activity — new bounties, approved submissions, etc.
 *
 * This file is for illustration only; it won't run without a real
 * blockchain connection. Replace the placeholder RPC URL.
 */

import { createPublicClient, http, webSocket } from 'viem';
import { worldchain } from 'viem/chains';
import {
  ACPClient,
  ESCROW_ABI,
  DEPLOYMENTS,
  WORLD_CHAIN_ID,
} from '@agent-commerce/sdk';

// ---------------------------------------------------------------------------
// Set up a public client with WebSocket transport (required for watching)
//
// Watching events uses eth_subscribe under the hood, which requires
// a WebSocket (or IPC) transport. HTTP polling is not supported by
// viem's watchContractEvent.
// ---------------------------------------------------------------------------

const WS_RPC_URL = 'wss://worldchain-mainnet.g.alchemy.com/v2/YOUR_API_KEY';
const HTTP_RPC_URL = 'https://worldchain-mainnet.g.alchemy.com/v2/YOUR_API_KEY';

const wsPublicClient = createPublicClient({
  chain: worldchain,
  transport: webSocket(WS_RPC_URL),
});

// For historical queries, HTTP is fine
const httpPublicClient = createPublicClient({
  chain: worldchain,
  transport: http(HTTP_RPC_URL),
});

// ---------------------------------------------------------------------------
// Approach 1: Real-time event watching with the SDK
// ---------------------------------------------------------------------------

function watchNewTasks() {
  // Create a read-only ACP client (no walletClient needed for watching)
  const acp = new ACPClient({ publicClient: wsPublicClient });

  console.log('Watching for new tasks (BountyCreated events)...');
  console.log('Press Ctrl+C to stop.\n');

  // watchTaskCreated returns an `unwatch` function you can call to
  // stop listening. The callback fires for each BountyCreated event.
  const unwatch = acp.watchTaskCreated((taskId, agent, paymentToken) => {
    const tokenName = identifyToken(paymentToken);
    console.log(`[NEW TASK] ID: ${taskId}`);
    console.log(`  Agent: ${agent}`);
    console.log(`  Payment: ${tokenName} (${paymentToken})`);
    console.log(`  Timestamp: ${new Date().toISOString()}`);
    console.log('');
  });

  // To stop watching after a timeout (e.g., 10 minutes):
  // setTimeout(() => {
  //   console.log('Stopping task watcher...');
  //   unwatch();
  // }, 10 * 60 * 1000);

  return unwatch;
}

function watchApprovals() {
  const acp = new ACPClient({ publicClient: wsPublicClient });

  console.log('Watching for submission approvals (SubmissionApproved events)...\n');

  const unwatch = acp.watchApproved((taskId, worker, payout) => {
    // Format payout — we don't know the token here, but we can look it up
    console.log(`[APPROVED] Task: ${taskId}`);
    console.log(`  Worker: ${worker}`);
    console.log(`  Payout: ${payout} (raw units)`);
    console.log(`  Timestamp: ${new Date().toISOString()}`);
    console.log('');
  });

  return unwatch;
}

// ---------------------------------------------------------------------------
// Approach 2: Fetching historical events using viem directly
//
// The SDK exposes ESCROW_ABI so you can use viem's getLogs or
// getContractEvents for historical queries.
// ---------------------------------------------------------------------------

async function fetchRecentTaskCreatedEvents(fromBlock: bigint) {
  console.log(`\nFetching BountyCreated events from block ${fromBlock}...\n`);

  const escrowAddress = DEPLOYMENTS[WORLD_CHAIN_ID].escrow;

  // Use viem's getContractEvents with the SDK's exported ABI
  const events = await httpPublicClient.getContractEvents({
    address: escrowAddress,
    abi: ESCROW_ABI,
    eventName: 'BountyCreated',
    fromBlock,
  });

  if (events.length === 0) {
    console.log('  No BountyCreated events found in this range.');
    return;
  }

  for (const event of events) {
    const args = event.args as {
      bountyId: bigint;
      agent: `0x${string}`;
      paymentToken: `0x${string}`;
      rewardPerWorker: bigint;
      maxWorkers: bigint;
      deadline: bigint;
    };

    console.log(`[HISTORICAL] Task ID: ${args.bountyId}`);
    console.log(`  Block: ${event.blockNumber}`);
    console.log(`  Agent: ${args.agent}`);
    console.log(`  Token: ${identifyToken(args.paymentToken)}`);
    console.log(`  Reward/worker: ${args.rewardPerWorker}`);
    console.log(`  Max workers: ${args.maxWorkers}`);
    console.log(`  Deadline: ${new Date(Number(args.deadline) * 1000).toISOString()}`);
    console.log(`  Tx: ${event.transactionHash}`);
    console.log('');
  }

  console.log(`  Total: ${events.length} event(s)`);
}

async function fetchRecentApprovalEvents(fromBlock: bigint) {
  console.log(`\nFetching SubmissionApproved events from block ${fromBlock}...\n`);

  const escrowAddress = DEPLOYMENTS[WORLD_CHAIN_ID].escrow;

  const events = await httpPublicClient.getContractEvents({
    address: escrowAddress,
    abi: ESCROW_ABI,
    eventName: 'SubmissionApproved',
    fromBlock,
  });

  if (events.length === 0) {
    console.log('  No SubmissionApproved events found in this range.');
    return;
  }

  for (const event of events) {
    const args = event.args as {
      bountyId: bigint;
      worker: `0x${string}`;
      workerPayout: bigint;
    };

    console.log(`[HISTORICAL APPROVAL] Task ID: ${args.bountyId}`);
    console.log(`  Block: ${event.blockNumber}`);
    console.log(`  Worker: ${args.worker}`);
    console.log(`  Payout: ${args.workerPayout} (raw units)`);
    console.log(`  Tx: ${event.transactionHash}`);
    console.log('');
  }

  console.log(`  Total: ${events.length} approval(s)`);
}

// ---------------------------------------------------------------------------
// Approach 3: Combined — poll + watch pattern
//
// A robust monitoring system first fetches missed historical events
// (e.g., while it was offline), then switches to real-time watching.
// ---------------------------------------------------------------------------

async function monitorWithBackfill(startBlock: bigint) {
  console.log('=== Combined Monitor: Backfill + Live ===\n');

  // 1) Backfill: fetch all events we may have missed
  await fetchRecentTaskCreatedEvents(startBlock);
  await fetchRecentApprovalEvents(startBlock);

  // 2) Live: start watching for new events going forward
  const unwatchTasks = watchNewTasks();
  const unwatchApprovals = watchApprovals();

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    console.log('\nShutting down event listeners...');
    unwatchTasks();
    unwatchApprovals();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map known token addresses to human-readable names */
function identifyToken(address: `0x${string}`): string {
  const deployment = DEPLOYMENTS[WORLD_CHAIN_ID];
  if (address.toLowerCase() === deployment.usdc.toLowerCase()) return 'USDC';
  if (address.toLowerCase() === deployment.wld.toLowerCase()) return 'WLD';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Agent Commerce Protocol — Event Listener ===\n');

  // Choose one of the approaches below:

  // --- Option A: Just watch live events ---
  // watchNewTasks();
  // watchApprovals();

  // --- Option B: Fetch historical events ---
  // Look back ~50,000 blocks (roughly 1-2 days on World Chain)
  // const currentBlock = await httpPublicClient.getBlockNumber();
  // const fromBlock = currentBlock - 50_000n;
  // await fetchRecentTaskCreatedEvents(fromBlock);
  // await fetchRecentApprovalEvents(fromBlock);

  // --- Option C: Combined backfill + live (recommended for production) ---
  const currentBlock = await httpPublicClient.getBlockNumber();
  const fromBlock = currentBlock - 50_000n;
  await monitorWithBackfill(fromBlock > 0n ? fromBlock : 0n);
}

main().catch(console.error);
