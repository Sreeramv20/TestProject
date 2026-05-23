import type { RuntimeContext } from '../config/types';
import { writeConfig } from '../config/configLoader';
import type { DiscordNotifier } from '../notifications/DiscordNotifier';
import type { TwitterAutomation } from '../automation/TwitterAutomation';
import type { InstructionParser } from '../parsers/InstructionParser';
import type { JsonDatabase } from '../storage/JsonDatabase';
import type { AppConfig } from '../config/types';
import type { BotStats, GiveawayEntry, TweetCandidate } from '../types';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { SafetyService } from './SafetyService';
import { ActionQueue } from './ActionQueue';

export class GiveawayService {
  readonly queue = new ActionQueue();
  private readonly safety: SafetyService;

  constructor(
    private readonly context: RuntimeContext,
    private readonly database: JsonDatabase,
    private readonly automation: TwitterAutomation,
    private readonly parser: InstructionParser,
    private readonly notifier: DiscordNotifier,
  ) {
    this.safety = new SafetyService(context.config.safety);
  }

  async poll(): Promise<void> {
    const { automation } = this.context.config;
    if (!automation.enabled) {
      logger.info('Automation disabled; skipping poll');
      return;
    }

    const candidates = await this.automation.discoverTweets();
    for (const tweet of candidates) {
      if (this.database.hasKnownTweet(tweet.id) || this.database.hasEntered(tweet.id)) {
        continue;
      }

      if (!this.withinRateLimits()) {
        logger.info('Rate limit reached; delaying remaining candidates', {
          tweetId: tweet.id,
        });
        break;
      }

      await this.queue.enqueue(`enter:${tweet.id}`, () => this.processTweet(tweet));
    }
  }

  async processTweet(tweet: TweetCandidate): Promise<GiveawayEntry | undefined> {
    await this.database.rememberTweet(tweet);
    const parsed = await this.parser.parse(tweet);

    if (parsed.highValue) {
      await this.notifier.highValueDetected(tweet, parsed);
    }

    const skippedReasons = this.safety.evaluate(tweet, parsed);
    if (skippedReasons.length > 0) {
      const entry = await this.database.addEntry({
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        authorHandle: tweet.authorHandle,
        text: tweet.text,
        parsedInstructions: {
          ...parsed,
          skippedReasons,
        },
        actions: [],
        status: 'skipped',
        dryRun: this.context.config.automation.dryRun,
      });
      logger.info('Skipped giveaway candidate', { tweetId: tweet.id, skippedReasons });
      return entry;
    }

    try {
      const actions = await withRetry(
        () => this.automation.executeGiveaway(tweet, parsed),
        {
          attempts: this.context.config.automation.maxRetries,
          baseDelayMs: this.context.config.automation.retryBaseDelayMs,
          label: `execute giveaway ${tweet.id}`,
        },
      );
      const failed = actions.filter((action) => !action.ok);
      const entry = await this.database.addEntry({
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        authorHandle: tweet.authorHandle,
        text: tweet.text,
        parsedInstructions: parsed,
        actions,
        status: this.context.config.automation.dryRun
          ? 'dry-run'
          : failed.length > 0
            ? 'failed'
            : 'entered',
        dryRun: this.context.config.automation.dryRun,
      });

      if (failed.length > 0) {
        for (const action of failed) {
          await this.database.addFailure({
            tweetId: tweet.id,
            tweetUrl: tweet.url,
            action: action.action,
            message: action.error ?? 'Action failed',
            recoverable: true,
          });
          await this.notifier.actionFailed(tweet, action.action, action.error ?? 'Action failed');
        }
      } else {
        await this.notifier.giveawayEntered(entry);
      }

      return entry;
    } catch (error) {
      await this.database.addFailure({
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
      await this.notifier.actionFailed(tweet, 'entry', error);
      logger.error('Giveaway entry failed', { tweetId: tweet.id, error });
      return undefined;
    }
  }

  getEntries(): GiveawayEntry[] {
    return this.database.getEntries();
  }

  getStats(): BotStats {
    return this.database.getStats();
  }

  getConfig(): AppConfig {
    return this.context.config;
  }

  async updateConfig(mutator: (config: AppConfig) => void): Promise<AppConfig> {
    mutator(this.context.config);
    await writeConfig(this.context.env.CONFIG_PATH, this.context.config);
    return this.context.config;
  }

  private withinRateLimits(): boolean {
    const stats = this.database.getStats();
    return (
      stats.enteredLastHour < this.context.config.automation.maxGiveawaysPerHour
      && stats.enteredToday < this.context.config.automation.maxGiveawaysPerDay
    );
  }
}
