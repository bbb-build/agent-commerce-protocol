// Agent Commerce Protocol の型定義

export enum TaskStatus {
  Open = 0,
  Completed = 1,
  Cancelled = 2,
}

export enum SubmissionStatus {
  None = 0,
  Submitted = 1,
  Approved = 2,
  Rejected = 3,
}

export interface Task {
  agent: `0x${string}`;
  paymentToken: `0x${string}`;
  rewardPerWorker: bigint;
  maxWorkers: bigint;
  acceptedWorkers: bigint;
  completedWorkers: bigint;
  totalDeposited: bigint;
  deadline: bigint;
  status: TaskStatus;
}

export interface WorkerTask {
  worker: `0x${string}`;
  submissionStatus: SubmissionStatus;
  submittedAt: bigint;
  paid: boolean;
}

export interface LockParams {
  /** ERC-20トークンアドレス（USDC or WLD） */
  paymentToken: `0x${string}`;
  /** 1ワーカーあたりの報酬（トークンの最小単位） */
  rewardPerWorker: bigint;
  /** 最大ワーカー数 */
  maxWorkers: number;
  /** 締切（Unixタイムスタンプ秒） */
  deadline: bigint;
}

export interface ACPClientConfig {
  /** コントラクトアドレス。省略時はWorld Chainのデフォルト */
  escrowAddress?: `0x${string}`;
  /** チェーンID。省略時は480（World Chain） */
  chainId?: number;
}
