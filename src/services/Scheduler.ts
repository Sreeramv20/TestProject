import type { BotStatus } from '../types';
import type { GiveawayService } from './GiveawayService';
import { logger } from '../utils/logger';

export class Scheduler {
  private timer?: NodeJS.Timeout;
  private running = false;
  private startedAt?: string;
  private lastPollAt?: string;
  private nextPollAt?: string;

  constructor(
    private readonly giveawayService: GiveawayService,
    private readonly pollIntervalSeconds: number,
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.startedAt = new Date().toISOString();
    logger.info('Scheduler started');
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.giveawayService.queue.drain();
    logger.info('Scheduler stopped');
  }

  getStatus(): BotStatus {
    return {
      running: this.running,
      queueDepth: this.giveawayService.queue.getDepth(),
      startedAt: this.startedAt,
      lastPollAt: this.lastPollAt,
      nextPollAt: this.nextPollAt,
    };
  }

  private schedule(delayMs: number): void {
    if (!this.running) {
      return;
    }
    this.nextPollAt = new Date(Date.now() + delayMs).toISOString();
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.lastPollAt = new Date().toISOString();
    try {
      await this.giveawayService.poll();
    } catch (error) {
      logger.error('Scheduled poll failed', { error });
    } finally {
      this.schedule(this.pollIntervalSeconds * 1000);
    }
  }
}
