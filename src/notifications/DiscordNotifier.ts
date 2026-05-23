import type { EnvConfig } from '../config/types';
import type { ActionResult, GiveawayEntry, ParsedInstructions, TweetCandidate } from '../types';
import { logger } from '../utils/logger';

type NotificationKind = 'entered' | 'failed' | 'captcha' | 'high-value';

export class DiscordNotifier {
  constructor(private readonly env: EnvConfig) {}

  async giveawayEntered(entry: GiveawayEntry): Promise<void> {
    await this.send('entered', {
      title: entry.dryRun ? 'Dry-run giveaway entry' : 'Giveaway entered',
      tweetUrl: entry.tweetUrl,
      account: entry.authorHandle,
      instructions: entry.parsedInstructions,
      actions: entry.actions,
    });
  }

  async highValueDetected(tweet: TweetCandidate, instructions: ParsedInstructions): Promise<void> {
    await this.send('high-value', {
      title: 'High-value Pokemon giveaway detected',
      tweetUrl: tweet.url,
      account: tweet.authorHandle,
      instructions,
      actions: [],
    });
  }

  async actionFailed(
    tweet: TweetCandidate | undefined,
    action: string,
    error: unknown,
  ): Promise<void> {
    await this.send('failed', {
      title: `Giveaway action failed: ${action}`,
      tweetUrl: tweet?.url,
      account: tweet?.authorHandle,
      description: error instanceof Error ? error.message : String(error),
      actions: [],
    });
  }

  async captchaOrLoginIssue(message: string): Promise<void> {
    await this.send('captcha', {
      title: 'Twitter/X login or captcha attention needed',
      description: message,
      actions: [],
    });
  }

  private async send(
    kind: NotificationKind,
    payload: {
      title: string;
      tweetUrl?: string;
      account?: string;
      description?: string;
      instructions?: ParsedInstructions;
      actions: ActionResult[];
    },
  ): Promise<void> {
    if (!this.env.DISCORD_WEBHOOK_URL) {
      return;
    }

    const response = await fetch(this.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Pokemon Giveaway Bot',
        embeds: [
          {
            title: payload.title,
            url: payload.tweetUrl,
            color: colorFor(kind),
            description: payload.description,
            fields: [
              field('Tweet URL', payload.tweetUrl ?? 'n/a'),
              field('Giveaway account', payload.account ? `@${payload.account.replace('@', '')}` : 'n/a'),
              field('Parsed instructions', payload.instructions?.rawSummary ?? 'n/a'),
              field(
                'Actions completed',
                payload.actions.length
                  ? payload.actions.map((action) => `${action.ok ? 'OK' : 'FAIL'} ${action.action}`).join('\n')
                  : 'n/a',
              ),
              field('Timestamp', new Date().toISOString()),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.warn('Discord notification failed', {
        status: response.status,
        body: await response.text(),
      });
    }
  }
}

function field(name: string, value: string): { name: string; value: string; inline: boolean } {
  return { name, value: value.slice(0, 1000), inline: false };
}

function colorFor(kind: NotificationKind): number {
  return {
    entered: 0x57f287,
    failed: 0xed4245,
    captcha: 0xfee75c,
    'high-value': 0x5865f2,
  }[kind];
}
