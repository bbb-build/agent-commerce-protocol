# @agent-commerce/sdk

TypeScript SDK for the [Agent Commerce Protocol](https://github.com/bbb-build/agent-commerce-protocol).

## Install

```bash
npm install @agent-commerce/sdk viem
```

## Quick Start

```ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ACPClient } from '@agent-commerce/sdk';

// Setup
const publicClient = createPublicClient({ transport: http('https://worldchain-mainnet.g.alchemy.com/v2/...') });
const walletClient = createWalletClient({
  account: privateKeyToAccount('0x...'),
  transport: http('https://worldchain-mainnet.g.alchemy.com/v2/...'),
});

const acp = new ACPClient({ publicClient, walletClient });

// LOCK — Create a task with escrowed funds
const taskId = await acp.lock({
  paymentToken: acp.tokens.USDC,
  rewardPerWorker: acp.parseUSDC(5),     // $5 per worker
  maxWorkers: 10,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),  // 7 days
});

// Read task state
const task = await acp.getTask(taskId);
console.log(`Task ${taskId}: ${task.acceptedWorkers}/${task.maxWorkers} workers`);

// RELEASE — Approve and pay a worker
await acp.release(taskId, '0xWorkerAddress...');

// RECLAIM — Get unused funds back after deadline
await acp.reclaim(taskId);
```

## API

### `new ACPClient({ publicClient, walletClient?, config? })`

| Param | Type | Description |
|-------|------|-------------|
| `publicClient` | `PublicClient` | viem public client for reads |
| `walletClient` | `WalletClient` | viem wallet client for writes (optional for read-only) |
| `config.escrowAddress` | `0x${string}` | Override contract address |
| `config.chainId` | `number` | Chain ID (default: 480 = World Chain) |

### Primitives

| Method | Protocol Primitive | Description |
|--------|-------------------|-------------|
| `lock(params)` | LOCK | Create task + escrow funds. Auto-handles ERC-20 approve |
| `release(taskId, worker)` | RELEASE | Approve submission, pay worker |
| `reject(taskId, worker)` | — | Reject submission (worker can resubmit) |
| `reclaim(taskId, worker?)` | RECLAIM | Refund unused funds |
| `autoRelease(taskId, worker)` | RELEASE | Anyone can trigger after 3-day timeout |

### Read Methods

| Method | Returns |
|--------|---------|
| `getTask(taskId)` | `Task` |
| `getWorkerTask(taskId, worker)` | `WorkerTask` |
| `calculateTotalCost(token, reward, workers)` | `bigint` |
| `taskCount()` | `bigint` |
| `getFeeBps(token)` | `{ platformBps, protocolBps }` |
| `contractBalance(token)` | `bigint` |

### Event Watchers

| Method | Event |
|--------|-------|
| `watchTaskCreated(cb)` | New task created |
| `watchApproved(cb)` | Submission approved + paid |

### Utilities

| Method | Description |
|--------|-------------|
| `parseUSDC(5)` | → `5_000_000n` |
| `parseWLD(10)` | → `10_000_000_000_000_000_000n` |
| `formatUSDC(n)` | → `"5.00"` |
| `formatWLD(n)` | → `"10.0000"` |
| `tokens.USDC` | USDC address on current chain |
| `tokens.WLD` | WLD address on current chain |

## License

MIT
