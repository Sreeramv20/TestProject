import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  BotStats,
  FailureRecord,
  GiveawayEntry,
  TweetCandidate,
} from '../types';

interface DatabaseState {
  entries: GiveawayEntry[];
  failures: FailureRecord[];
  knownTweetIds: string[];
}

const emptyState: DatabaseState = {
  entries: [],
  failures: [],
  knownTweetIds: [],
};

export class JsonDatabase {
  private state: DatabaseState = emptyState;
  private writeChain = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = {
        ...emptyState,
        ...JSON.parse(raw),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.persist();
    }
  }

  getEntries(limit = 100): GiveawayEntry[] {
    return [...this.state.entries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  getFailures(limit = 100): FailureRecord[] {
    return [...this.state.failures]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async addEntry(entry: Omit<GiveawayEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<GiveawayEntry> {
    const now = new Date().toISOString();
    const saved: GiveawayEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.state.entries.push(saved);
    this.addKnownTweet(entry.tweetId);
    await this.persist();
    return saved;
  }

  async addFailure(failure: Omit<FailureRecord, 'id' | 'createdAt'>): Promise<FailureRecord> {
    const saved: FailureRecord = {
      ...failure,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.state.failures.push(saved);
    await this.persist();
    return saved;
  }

  hasKnownTweet(tweetId: string): boolean {
    return this.state.knownTweetIds.includes(tweetId)
      || this.state.entries.some((entry) => entry.tweetId === tweetId);
  }

  async rememberTweet(tweet: TweetCandidate): Promise<void> {
    this.addKnownTweet(tweet.id);
    await this.persist();
  }

  hasEntered(tweetId: string): boolean {
    return this.state.entries.some(
      (entry) => entry.tweetId === tweetId && ['entered', 'dry-run'].includes(entry.status),
    );
  }

  getStats(): BotStats {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const today = new Date().toISOString().slice(0, 10);
    const entered = this.state.entries.filter((entry) =>
      ['entered', 'dry-run'].includes(entry.status),
    );

    return {
      totalEntries: entered.length,
      dryRunEntries: entered.filter((entry) => entry.dryRun).length,
      skipped: this.state.entries.filter((entry) => entry.status === 'skipped').length,
      failures: this.state.failures.length,
      enteredLastHour: entered.filter(
        (entry) => new Date(entry.createdAt).getTime() >= oneHourAgo,
      ).length,
      enteredToday: entered.filter((entry) => entry.createdAt.startsWith(today)).length,
    };
  }

  private addKnownTweet(tweetId: string): void {
    if (!this.state.knownTweetIds.includes(tweetId)) {
      this.state.knownTweetIds.push(tweetId);
    }
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() =>
      fs.writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8'),
    );
    await this.writeChain;
  }
}
