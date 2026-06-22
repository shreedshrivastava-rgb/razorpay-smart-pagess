const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function jitter(delay: number): number {
  return Math.round(delay * (0.5 + Math.random() * 0.5));
}

function exponentialBackoff(attempt: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  return jitter(delay);
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (attempt: number, error: Error) => boolean;
}

const defaultRetryOn = (_attempt: number, error: Error): boolean => {
  const msg = error.message;
  const isTransient =
    msg.includes("timeout") ||
    msg.includes("5") ||
    msg.includes("429") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("socket") ||
    msg.includes("network") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("temporarily") ||
    msg.includes("overloaded") ||
    msg.includes("capacity");
  return isTransient;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { maxRetries: 3 }
): Promise<T> {
  const maxRetries = options.maxRetries;
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? MAX_DELAY_MS;
  const retryOn = options.retryOn ?? defaultRetryOn;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) break;
      if (!retryOn(attempt, lastError)) break;

      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const delayWithJitter = jitter(delayMs);

      await new Promise((resolve) => setTimeout(resolve, delayWithJitter));
    }
  }

  throw lastError ?? new Error("Retry failed");
}

export interface QueueJob<T = unknown> {
  id: string;
  type: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
}

export interface QueueWorker<T = unknown> {
  type: string;
  concurrency: number;
  handler: (job: QueueJob<T>) => Promise<void>;
}

const localQueue: Map<string, QueueJob[]> = new Map();
const workerRegistry: Map<string, QueueWorker> = new Map();
const activeWorkers = new Map<string, number>();

export function registerWorker(worker: QueueWorker): void {
  workerRegistry.set(worker.type, worker);
}

export async function enqueueJob<T>(type: string, payload: T): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job: QueueJob<T> = {
    id,
    type,
    payload,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
  };

  const jobs = localQueue.get(type) ?? [];
  jobs.push(job);
  localQueue.set(type, jobs);

  void processQueue(type);

  return id;
}

async function processQueue(type: string): Promise<void> {
  const worker = workerRegistry.get(type);
  if (!worker) return;

  const jobs = localQueue.get(type) ?? [];
  if (jobs.length === 0) return;

  const currentActive = activeWorkers.get(type) ?? 0;
  if (currentActive >= worker.concurrency) return;

  const job = jobs.shift()!;
  if (!job) return;

  activeWorkers.set(type, currentActive + 1);

  try {
    await withRetry(
      () => worker.handler(job),
      { maxRetries: job.maxAttempts - 1 }
    );
  } catch {
    // job failed after all retries
  } finally {
    const remaining = activeWorkers.get(type) ?? 1;
    activeWorkers.set(type, Math.max(0, remaining - 1));

    if (jobs.length > 0) {
      setImmediate(() => processQueue(type));
    }
  }
}
