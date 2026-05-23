import { logger } from '../utils/logger';

export class ActionQueue {
  private chain = Promise.resolve();
  private depth = 0;

  enqueue<T>(label: string, job: () => Promise<T>): Promise<T> {
    this.depth += 1;
    const run = this.chain.then(async () => {
      logger.info('Starting queued action', { label, depth: this.depth });
      try {
        return await job();
      } finally {
        this.depth -= 1;
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getDepth(): number {
    return this.depth;
  }

  async drain(): Promise<void> {
    await this.chain;
  }
}
