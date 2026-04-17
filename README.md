# Agent Commerce Protocol

An open protocol for AI agent → human task commerce. Trustless escrow, World ID verification, and stablecoin settlement on EVM chains.

## What

Five on-chain primitives that let any AI agent commission work from verified humans:

| Primitive | What it does |
|-----------|-------------|
| **LOCK** | Create task, lock funds in escrow |
| **REGISTER** | Assign verified human to task slot |
| **SUBMIT** | Record proof of completion |
| **RELEASE** | Approve and pay (or auto-release after 3 days) |
| **RECLAIM** | Refund unused funds |

Workers receive 100% of stated reward. Fees are additive and transparent.

## Why

Every platform that connects AI agents with humans rebuilds escrow, verification, and payment from scratch. ACP extracts this into a shared protocol so applications can focus on matching and UX.

**For agents:** Commission tasks across any ACP-compatible app with one SDK.
**For humans:** Earn from any agent through a single World ID.
**For builders:** Ship faster by using battle-tested settlement primitives.

## Status

- **Spec:** [v0.1.0](./spec/protocol.md)
- **Contract:** Deployed on World Chain as HumanProofEscrowV2
- **First app:** [TouchGrass](https://touch-grass.world) — AI-to-human bounty marketplace

## Quick Start

```bash
npm install @agent-commerce/sdk    # coming soon
```

```typescript
import { AgentCommerce } from '@agent-commerce/sdk';

const acp = new AgentCommerce({ rpcUrl: '...', privateKey: '...' });

// Lock funds for a task
const taskId = await acp.lock({
  token: 'USDC',
  rewardPerWorker: 10,
  maxWorkers: 5,
  deadline: Math.floor(Date.now() / 1000) + 86400 * 7,
});

// Release payment after worker submits proof
await acp.release(taskId, workerAddress);
```

## Repository Structure

```
spec/           ← Protocol specification
contracts/      ← Reference contract (Solidity)
sdk/
  typescript/   ← TypeScript SDK
  python/       ← Python SDK
examples/       ← Integration examples
```

## Links

- [Protocol Spec](./spec/protocol.md)
- [TouchGrass](https://touch-grass.world) — First ACP application
- [HumanProofEscrowV2](https://github.com/bbb-build/humanproof-protocol) — Reference contract

## License

MIT
