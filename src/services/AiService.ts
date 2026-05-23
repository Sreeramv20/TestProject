import type { AiConfig, EnvConfig, ReplyConfig } from '../config/types';
import type { ParsedInstructions, TweetCandidate } from '../types';
import { pickRandom } from '../utils/random';
import { logger } from '../utils/logger';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class AiService {
  constructor(
    private readonly aiConfig: AiConfig,
    private readonly env: EnvConfig,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.aiConfig.enabled && this.env.OPENAI_API_KEY);
  }

  async parseInstructions(tweet: TweetCandidate): Promise<Partial<ParsedInstructions> | undefined> {
    if (!this.isAvailable()) {
      return undefined;
    }

    const response = await this.chat([
      {
        role: 'system',
        content:
          'You parse Twitter/X Pokemon card giveaway instructions. Return only strict JSON matching the requested schema. Do not include markdown.',
      },
      {
        role: 'user',
        content: [
          'Extract required entry actions from this tweet.',
          'Schema:',
          '{"follow":["@handle"],"like":true,"retweet":true,"reply":false,"replyPrompt":"","tagCount":0,"quoteRetweet":false,"quotePrompt":"","joinDiscord":false,"visitLinks":[],"extraEntryHints":[],"confidence":0.0,"highValue":false,"rawSummary":"","skippedReasons":[]}',
          `Author: @${tweet.authorHandle}`,
          `Text: ${tweet.text}`,
        ].join('\n'),
      },
    ], true);

    return parseJsonObject(response);
  }

  async generateReply(
    tweet: TweetCandidate,
    instructions: ParsedInstructions,
    replies: ReplyConfig,
  ): Promise<string> {
    if (!this.isAvailable()) {
      return pickRandom(replies.templates);
    }

    try {
      const response = await this.chat([
        {
          role: 'system',
          content:
            'Write short, friendly Pokemon giveaway replies. Avoid spammy language, hashtags, links, and promises. Return only the reply text.',
        },
        {
          role: 'user',
          content: [
            `Tweet: ${tweet.text}`,
            `Reply requirement: ${instructions.replyPrompt || 'general Pokemon-related reply'}`,
            `Favorite options: ${replies.pokemonFavorites.join(', ')}`,
            'Keep it under 220 characters.',
          ].join('\n'),
        },
      ], false);
      return response.trim().slice(0, 260);
    } catch (error) {
      logger.warn('AI reply generation failed; falling back to template', { error });
      return pickRandom(replies.templates);
    }
  }

  private async chat(messages: ChatMessage[], jsonMode: boolean): Promise<string> {
    const baseUrl = this.aiConfig.baseUrl ?? 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.aiConfig.model,
        temperature: this.aiConfig.temperature,
        max_tokens: this.aiConfig.maxTokens,
        messages,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API failed: ${response.status} ${await response.text()}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI-compatible API returned no content');
    }
    return content;
  }
}

function parseJsonObject<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn('AI response did not contain JSON', { value, error });
      return undefined;
    }
    return JSON.parse(match[0]) as T;
  }
}
