import {
  type PublicClient,
  type WalletClient,
  type Hash,
  type Log,
  parseEventLogs,
} from 'viem';
import { ESCROW_ABI, ERC20_ABI } from './abi.js';
import { DEPLOYMENTS, WORLD_CHAIN_ID } from './constants.js';
import type { Task, WorkerTask, LockParams, ACPClientConfig } from './types.js';
import { TaskStatus, SubmissionStatus } from './types.js';

/**
 * Agent Commerce Protocol クライアント
 *
 * AIエージェントが人間にタスクを発注し、World ID認証者が完了し、
 * トークンが自動で動く — その全フローを3行で実装できるSDK。
 *
 * @example
 * ```ts
 * const acp = new ACPClient({ publicClient, walletClient });
 * const taskId = await acp.lock({
 *   paymentToken: acp.tokens.USDC,
 *   rewardPerWorker: acp.parseUSDC(5),
 *   maxWorkers: 10,
 *   deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
 * });
 * await acp.release(taskId, workerAddress);
 * ```
 */
export class ACPClient {
  private readonly pub: PublicClient;
  private readonly wallet: WalletClient | null;
  private readonly escrow: `0x${string}`;
  private readonly chain: number;

  constructor(opts: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    config?: ACPClientConfig;
  }) {
    this.pub = opts.publicClient;
    this.wallet = opts.walletClient ?? null;
    this.chain = opts.config?.chainId ?? WORLD_CHAIN_ID;

    const deployment = DEPLOYMENTS[this.chain as keyof typeof DEPLOYMENTS];
    this.escrow = opts.config?.escrowAddress
      ?? deployment?.escrow
      ?? (() => { throw new Error(`No deployment for chain ${this.chain}. Pass escrowAddress explicitly.`); })();
  }

  /** デプロイ済みトークンアドレス */
  get tokens() {
    const deployment = DEPLOYMENTS[this.chain as keyof typeof DEPLOYMENTS];
    if (!deployment) throw new Error(`No token addresses for chain ${this.chain}`);
    return { USDC: deployment.usdc, WLD: deployment.wld };
  }

  // ── ユーティリティ ──

  parseUSDC(amount: number): bigint { return BigInt(Math.round(amount * 1e6)); }
  parseWLD(amount: number): bigint { return BigInt(Math.round(amount * 1e18)); }
  formatUSDC(amount: bigint): string { return (Number(amount) / 1e6).toFixed(2); }
  formatWLD(amount: bigint): string { return (Number(amount) / 1e18).toFixed(4); }

  // ── 5つのプリミティブ ──

  /**
   * LOCK — タスク作成とエスクロー資金ロック
   * ERC-20のapproveを自動実行してからcreateを呼ぶ。
   */
  async lock(params: LockParams): Promise<bigint> {
    const w = this.w();

    const totalCost = await this.calculateTotalCost(
      params.paymentToken, params.rewardPerWorker, params.maxWorkers,
    );

    // ERC-20 approve（不足時のみ）
    const allowance = await this.pub.readContract({
      address: params.paymentToken, abi: ERC20_ABI, functionName: 'allowance',
      args: [w.account!.address, this.escrow],
    }) as bigint;

    if (allowance < totalCost) {
      const approveTx = await w.writeContract({
        address: params.paymentToken, abi: ERC20_ABI, functionName: 'approve',
        args: [this.escrow, totalCost], chain: null, account: w.account!,
      });
      await this.pub.waitForTransactionReceipt({ hash: approveTx });
    }

    const tx = await w.writeContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: 'createBounty',
      args: [params.paymentToken, params.rewardPerWorker, BigInt(params.maxWorkers), params.deadline],
      chain: null, account: w.account!,
    });

    const receipt = await this.pub.waitForTransactionReceipt({ hash: tx });
    const logs = parseEventLogs({ abi: ESCROW_ABI, logs: receipt.logs as Log[], eventName: 'BountyCreated' });
    if (logs.length === 0) throw new Error('BountyCreated event not found in receipt');
    return (logs[0] as any).args.bountyId;
  }

  /** RELEASE — 承認して報酬を支払う */
  async release(taskId: bigint, worker: `0x${string}`): Promise<Hash> {
    return this.writeTx('approveSubmission', [taskId, worker]);
  }

  /** REJECT — 提出を却下（ワーカーは再提出可能） */
  async reject(taskId: bigint, worker: `0x${string}`): Promise<Hash> {
    return this.writeTx('rejectSubmission', [taskId, worker]);
  }

  /**
   * RECLAIM — 未使用資金を回収
   * worker指定: 特定ワーカー分を返金
   * worker省略 + ワーカー0人: 全額キャンセル
   * worker省略 + 期限後: 未充足スロット分を返金
   */
  async reclaim(taskId: bigint, worker?: `0x${string}`): Promise<Hash> {
    if (worker) return this.writeTx('reclaimForWorker', [taskId, worker]);
    const task = await this.getTask(taskId);
    const fn = task.acceptedWorkers === 0n ? 'cancelBounty' : 'reclaimAfterDeadline';
    return this.writeTx(fn, [taskId]);
  }

  /** AUTO_RELEASE — 3日間エージェント無応答時、誰でも自動承認を実行可能 */
  async autoRelease(taskId: bigint, worker: `0x${string}`): Promise<Hash> {
    return this.writeTx('autoApprove', [taskId, worker]);
  }

  // ── 読み取り ──

  async getTask(taskId: bigint): Promise<Task> {
    const raw = await this.pub.readContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: 'getBounty', args: [taskId],
    }) as any;
    return {
      agent: raw.agent, paymentToken: raw.paymentToken,
      rewardPerWorker: raw.rewardPerWorker, maxWorkers: raw.maxWorkers,
      acceptedWorkers: raw.acceptedWorkers, completedWorkers: raw.completedWorkers,
      totalDeposited: raw.totalDeposited, deadline: raw.deadline,
      status: Number(raw.status) as TaskStatus,
    };
  }

  async getWorkerTask(taskId: bigint, worker: `0x${string}`): Promise<WorkerTask> {
    const raw = await this.pub.readContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: 'getWorkerTask', args: [taskId, worker],
    }) as any;
    return {
      worker: raw.worker, submissionStatus: Number(raw.submissionStatus) as SubmissionStatus,
      submittedAt: raw.submittedAt, paid: raw.paid,
    };
  }

  async calculateTotalCost(paymentToken: `0x${string}`, rewardPerWorker: bigint, maxWorkers: number): Promise<bigint> {
    return await this.pub.readContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: 'calculateTotalCost',
      args: [paymentToken, rewardPerWorker, BigInt(maxWorkers)],
    }) as bigint;
  }

  async taskCount(): Promise<bigint> {
    return await this.pub.readContract({ address: this.escrow, abi: ESCROW_ABI, functionName: 'bountyCount' }) as bigint;
  }

  async getFeeBps(token: `0x${string}`): Promise<{ platformBps: bigint; protocolBps: bigint }> {
    const [platformBps, protocolBps] = await this.pub.readContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: 'getTokenFeeBps', args: [token],
    }) as [bigint, bigint];
    return { platformBps, protocolBps };
  }

  async contractBalance(token: `0x${string}`): Promise<bigint> {
    return await this.pub.readContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: 'getContractBalance', args: [token],
    }) as bigint;
  }

  // ── イベント監視 ──

  watchTaskCreated(callback: (taskId: bigint, agent: `0x${string}`, paymentToken: `0x${string}`) => void) {
    return this.pub.watchContractEvent({
      address: this.escrow, abi: ESCROW_ABI, eventName: 'BountyCreated',
      onLogs: (logs) => { for (const l of logs) { const a = (l as any).args; callback(a.bountyId, a.agent, a.paymentToken); } },
    });
  }

  watchApproved(callback: (taskId: bigint, worker: `0x${string}`, payout: bigint) => void) {
    return this.pub.watchContractEvent({
      address: this.escrow, abi: ESCROW_ABI, eventName: 'SubmissionApproved',
      onLogs: (logs) => { for (const l of logs) { const a = (l as any).args; callback(a.bountyId, a.worker, a.workerPayout); } },
    });
  }

  // ── 内部 ──

  private w(): WalletClient {
    if (!this.wallet?.account) throw new Error('WalletClient with account required for write operations');
    return this.wallet;
  }

  private async writeTx(fn: string, args: readonly unknown[]): Promise<Hash> {
    const w = this.w();
    const tx = await w.writeContract({
      address: this.escrow, abi: ESCROW_ABI, functionName: fn,
      args, chain: null, account: w.account!,
    } as any);
    await this.pub.waitForTransactionReceipt({ hash: tx });
    return tx;
  }
}
