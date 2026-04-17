# Agent Commerce Protocol — Specification v0.1.0

## Abstract

Agent Commerce Protocol (ACP) is an open protocol enabling AI agents to commission tasks from verified humans, with trustless escrow and settlement on EVM-compatible chains. The protocol defines five atomic primitives that any application can compose to build agent-to-human commerce.

## Motivation

AI agents increasingly need to delegate tasks that require human judgment, physical presence, or creative work. Today, each platform builds its own escrow, verification, and payment system from scratch. ACP extracts these into a shared protocol layer so that:

- **Agents** can commission tasks across any ACP-compatible application
- **Humans** can earn from any agent through a single identity (World ID)
- **Applications** can focus on UX and matching, not payment infrastructure

## Terminology

| Term | Definition |
|------|-----------|
| **Agent** | An AI system or its operator that creates and funds tasks |
| **Worker** | A verified human who performs tasks |
| **Relayer** | An authorized intermediary that registers workers and marks submissions on-chain (typically the application layer) |
| **Task** | A unit of work with defined reward, deadline, and acceptance criteria |
| **Escrow** | On-chain contract holding funds until task completion or cancellation |

## Protocol Primitives

ACP defines five atomic on-chain operations. All off-chain coordination (matching, messaging, dispute resolution) is delegated to the application layer.

### 1. LOCK

Creates a task and locks funds in escrow.

```
lock(paymentToken, rewardPerWorker, maxWorkers, deadline) → taskId
```

- Transfers `(reward + fees) × maxWorkers` from agent to escrow contract
- Fees are additive (workers always receive 100% of stated reward)
- Returns a unique `taskId` for all subsequent operations
- `deadline` is a Unix timestamp after which unfilled slots can be reclaimed

**Invariant:** Once locked, funds can only exit via RELEASE or RECLAIM. No other path exists.

### 2. REGISTER

Assigns a verified worker to a task slot.

```
register(taskId, worker)
```

- Called by the Relayer (not the worker directly)
- Worker must hold a valid World ID (Orb-level verification)
- Increments `acceptedWorkers` counter
- Reverts if `acceptedWorkers >= maxWorkers`
- One worker per slot; no duplicate registrations

### 3. SUBMIT

Records that a worker has submitted proof of completion.

```
submit(taskId, worker)
```

- Called by the Relayer after off-chain proof is uploaded
- Sets `submittedAt` timestamp on-chain
- Proof itself is stored off-chain (IPFS, API, etc.) — the contract only records the signal
- Worker can resubmit after rejection

### 4. RELEASE

Approves submission and releases payment.

```
release(taskId, worker)
```

- Called by the Agent (task creator)
- Transfers reward to worker, platform fee to platform wallet, protocol fee to protocol wallet
- Alternatively, `autoRelease(taskId, worker)` can be called by anyone after a configurable delay (default: 3 days) from submission — protecting workers from unresponsive agents

**Fee split (per release):**
| Recipient | Amount |
|-----------|--------|
| Worker | `rewardPerWorker` (100% of stated reward) |
| Platform | `reward × platformFeeBps / 10000` |
| Protocol | `reward × protocolFeeBps / 10000` |

### 5. RECLAIM

Returns unused funds to the agent.

```
reclaim(taskId)               // Cancel entire task (only if no workers registered)
reclaimAfterDeadline(taskId)  // Reclaim unfilled slots after deadline
reclaimForWorker(taskId, worker)  // Reclaim specific slot post-deadline
```

- Full cancellation only possible before any worker is registered
- After deadline, agent can reclaim funds for unfilled or incomplete slots
- Partial reclaim does not affect other active workers

## State Machine

### Task States

```
                    ┌─────────┐
     lock() ───────►│  OPEN   │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         all slots    deadline   reclaim()
         completed    passed    (no workers)
              │          │          │
              ▼          │          ▼
        ┌───────────┐    │   ┌───────────┐
        │ COMPLETED │    │   │ CANCELLED │
        └───────────┘    │   └───────────┘
                         │
                    reclaimAfterDeadline()
                    (unfilled slots refunded,
                     active workers unaffected)
```

### Worker States

```
                    ┌──────┐
   register() ────►│ REGISTERED │
                    └──────┬─────┘
                           │
                    submit()
                           │
                    ┌──────▼──────┐
                    │  SUBMITTED  │◄──── resubmit after rejection
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │             │
               release()    reject()
                    │             │
             ┌──────▼──┐   ┌─────▼─────┐
             │ APPROVED │   │ REJECTED  │
             │  (paid)  │   │(can retry)│
             └──────────┘   └───────────┘
```

## Token Support

The protocol supports any ERC-20 token. Fee rates are configured per token by the contract owner.

**Reference configuration (from TouchGrass deployment):**

| Token | Platform Fee | Protocol Fee | Max Reward |
|-------|-------------|--------------|------------|
| USDC  | 13% (1300 bps) | 7% (700 bps) | $100 |
| WLD   | 7% (700 bps)   | 3% (300 bps) | 1000 WLD |

Applications MAY set different fee rates. The protocol enforces that fees are additive and transparent.

## Human Verification

ACP requires Orb-level World ID verification for workers. This guarantees:

- **One person, one identity** — Sybil resistance without KYC
- **Privacy-preserving** — Zero-knowledge proofs; no personal data on-chain
- **Global** — Works across jurisdictions

The Relayer is responsible for verifying World ID before calling `register()`.

## Off-Chain Layer (Application Responsibility)

The protocol intentionally excludes:

- **Task discovery and matching** — Applications build their own UX
- **Proof storage** — Applications choose their storage (IPFS, S3, database)
- **Messaging** — Applications provide communication channels
- **Dispute resolution** — Applications implement their own process
- **Reputation** — Applications track worker/agent ratings

This separation allows diverse applications to share the same settlement layer while competing on user experience.

## Contract Interface (Solidity)

```solidity
interface IAgentCommerceEscrow {
    // === Primitives ===
    function lock(
        address paymentToken,
        uint256 rewardPerWorker,
        uint256 maxWorkers,
        uint256 deadline
    ) external returns (uint256 taskId);

    function register(uint256 taskId, address worker) external;

    function submit(uint256 taskId, address worker) external;

    function release(uint256 taskId, address worker) external;

    function autoRelease(uint256 taskId, address worker) external;

    function reclaim(uint256 taskId) external;

    function reclaimAfterDeadline(uint256 taskId) external;

    function reclaimForWorker(uint256 taskId, address worker) external;

    // === Views ===
    function getTask(uint256 taskId) external view returns (Task memory);

    function getWorkerTask(uint256 taskId, address worker) external view returns (WorkerTask memory);

    function calculateTotalCost(
        address paymentToken,
        uint256 rewardPerWorker,
        uint256 maxWorkers
    ) external view returns (uint256);

    // === Events ===
    event TaskCreated(uint256 indexed taskId, address indexed agent, address paymentToken, uint256 rewardPerWorker, uint256 maxWorkers, uint256 deadline);
    event WorkerRegistered(uint256 indexed taskId, address indexed worker);
    event SubmissionMarked(uint256 indexed taskId, address indexed worker);
    event SubmissionApproved(uint256 indexed taskId, address indexed worker, uint256 workerPayout);
    event SubmissionRejected(uint256 indexed taskId, address indexed worker);
    event AutoApproved(uint256 indexed taskId, address indexed worker, uint256 workerPayout);
    event TaskCancelled(uint256 indexed taskId, uint256 refunded);
}
```

## Deployment

### Current

The protocol is deployed as HumanProofEscrowV2 on World Chain:
- **Contract:** `0x...` (see contracts/ directory for addresses)
- **First application:** [TouchGrass](https://touch-grass.world)

### Planned

- Deployment on Base, Arbitrum, and Ethereum mainnet
- Cross-chain task creation (lock on chain A, worker on chain B)

## Versioning

This specification follows [Semantic Versioning](https://semver.org/). Breaking changes to the five primitives require a major version bump. Fee model changes and new view functions are minor versions.

## License

MIT
