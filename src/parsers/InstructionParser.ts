import type { AiService } from '../services/AiService';
import type { ParsedInstructions, TweetCandidate } from '../types';
import { logger } from '../utils/logger';

const numberWords: Record<string, number> = {
  one: 1,
  a: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

const highValueTerms = [
  'booster box',
  'etb',
  'elite trainer box',
  'sealed case',
  'charizard',
  'pokemon center',
  '151',
  'surging sparks',
];

export class InstructionParser {
  constructor(private readonly aiService: AiService) {}

  async parse(tweet: TweetCandidate): Promise<ParsedInstructions> {
    const fallback = ruleBasedParse(tweet);

    try {
      const aiParsed = await this.aiService.parseInstructions(tweet);
      if (!aiParsed) {
        return fallback;
      }

      return normalizeParsedInstructions({
        ...fallback,
        ...aiParsed,
        follow: mergeHandles(fallback.follow, aiParsed.follow ?? []),
        visitLinks: [...new Set([...(fallback.visitLinks ?? []), ...(aiParsed.visitLinks ?? [])])],
        extraEntryHints: [
          ...new Set([...(fallback.extraEntryHints ?? []), ...(aiParsed.extraEntryHints ?? [])]),
        ],
        confidence: Math.max(fallback.confidence, Number(aiParsed.confidence ?? 0)),
      });
    } catch (error) {
      logger.warn('AI instruction parsing failed; using rule parser', {
        tweetId: tweet.id,
        error,
      });
      return fallback;
    }
  }
}

export function ruleBasedParse(tweet: TweetCandidate): ParsedInstructions {
  const text = tweet.text;
  const normalized = text.toLowerCase();
  const handles = extractHandles(text);
  const followRequested = /\b(follow|f\/?o)\b/.test(normalized);
  const authorHandle = normalizeHandle(tweet.authorHandle);
  const followHandles = followRequested
    ? mergeHandles(
        handles.filter((handle) => !isTagContext(text, handle)),
        [authorHandle],
      )
    : [];

  const tagCount = detectTagCount(normalized);
  const reply = /\b(reply|comment|tell us|tell me|drop|answer)\b/.test(normalized)
    || tagCount > 0;
  const quoteRetweet = /\b(quote|qrt|quote retweet|quote repost)\b/.test(normalized);
  const retweet = /\b(rt|retweet|repost|share)\b/.test(normalized);
  const like = /\b(like|heart|fav|favorite)\b/.test(normalized);
  const joinDiscord = /\b(discord|server)\b/.test(normalized)
    && /\b(join|enter|verify)\b/.test(normalized);
  const visitLinks = extractLinks(text);

  const skippedReasons: string[] = [];
  if (/\b(buy|purchase|receipt|order|must buy|with purchase)\b/.test(normalized)) {
    skippedReasons.push('purchase_required');
  }
  if (/\b(crypto|nft|airdrop|wallet|web3)\b/.test(normalized)) {
    skippedReasons.push('crypto_or_nft');
  }

  const detectedActions = [
    followHandles.length > 0,
    like,
    retweet,
    reply,
    quoteRetweet,
    joinDiscord,
    visitLinks.length > 0,
  ].filter(Boolean).length;

  return normalizeParsedInstructions({
    follow: followHandles,
    like,
    retweet,
    reply,
    replyPrompt: detectReplyPrompt(text),
    tagCount,
    quoteRetweet,
    quotePrompt: quoteRetweet ? detectQuotePrompt(text) : undefined,
    joinDiscord,
    visitLinks,
    extraEntryHints: detectExtraEntryHints(normalized),
    confidence: Math.min(0.95, 0.25 + detectedActions * 0.15),
    highValue: highValueTerms.some((term) => normalized.includes(term)),
    rawSummary: summarizeInstructions({
      follow: followHandles,
      like,
      retweet,
      reply,
      tagCount,
      quoteRetweet,
      joinDiscord,
    }),
    skippedReasons,
  });
}

function normalizeParsedInstructions(value: Partial<ParsedInstructions>): ParsedInstructions {
  return {
    follow: mergeHandles(value.follow ?? []),
    like: Boolean(value.like),
    retweet: Boolean(value.retweet),
    reply: Boolean(value.reply),
    replyPrompt: value.replyPrompt,
    tagCount: Number(value.tagCount ?? 0),
    quoteRetweet: Boolean(value.quoteRetweet),
    quotePrompt: value.quotePrompt,
    joinDiscord: Boolean(value.joinDiscord),
    visitLinks: value.visitLinks ?? [],
    extraEntryHints: value.extraEntryHints ?? [],
    confidence: Math.max(0, Math.min(1, Number(value.confidence ?? 0))),
    highValue: Boolean(value.highValue),
    rawSummary: value.rawSummary ?? 'No clear instructions detected',
    skippedReasons: value.skippedReasons ?? [],
  };
}

function extractHandles(text: string): string[] {
  return [...text.matchAll(/(^|\s)@([a-zA-Z0-9_]{1,15})/g)].map((match) =>
    normalizeHandle(match[2]),
  );
}

function extractLinks(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)]+/gi)].map((match) => match[0]);
}

function detectTagCount(normalized: string): number {
  const numeric = normalized.match(/\btag\s+(\d+)\s+(friend|people|person|trainer|user)/);
  if (numeric) {
    return Number(numeric[1]);
  }

  const word = normalized.match(/\btag\s+(one|a|two|three|four|five)\s+(friend|people|person|trainer|user)/);
  if (word) {
    return numberWords[word[1]] ?? 1;
  }

  if (/\btag\s+(a\s+)?friend\b/.test(normalized)) {
    return 1;
  }

  return 0;
}

function detectReplyPrompt(text: string): string | undefined {
  const patterns = [
    /reply\s+(?:with|your|and tell us)?\s*([^.!?\n]{5,120})/i,
    /comment\s+(?:with|your)?\s*([^.!?\n]{5,120})/i,
    /tell\s+(?:us|me)\s+([^.!?\n]{5,120})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function detectQuotePrompt(text: string): string | undefined {
  const match = text.match(/quote(?:\s+retweet|\s+repost)?\s+(?:with)?\s*([^.!?\n]{5,120})/i);
  return match?.[1]?.trim();
}

function detectExtraEntryHints(normalized: string): string[] {
  const hints: string[] = [];
  if (normalized.includes('extra entry') || normalized.includes('bonus entry')) {
    hints.push('Tweet mentions extra or bonus entries');
  }
  if (normalized.includes('tag 3') || normalized.includes('tag three')) {
    hints.push('More tags may provide extra entries');
  }
  return hints;
}

function isTagContext(text: string, handle: string): boolean {
  const escaped = handle.replace('@', '@?');
  return new RegExp(`tag[^\\n.]{0,40}${escaped}`, 'i').test(text);
}

function mergeHandles(...handleGroups: string[][]): string[] {
  return [...new Set(handleGroups.flat().map(normalizeHandle).filter(Boolean))];
}

function normalizeHandle(handle: string): string {
  return handle.startsWith('@') ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
}

function summarizeInstructions(value: {
  follow: string[];
  like: boolean;
  retweet: boolean;
  reply: boolean;
  tagCount: number;
  quoteRetweet: boolean;
  joinDiscord: boolean;
}): string {
  const parts: string[] = [];
  if (value.follow.length) parts.push(`follow ${value.follow.join(', ')}`);
  if (value.like) parts.push('like');
  if (value.retweet) parts.push('repost');
  if (value.reply) parts.push('reply');
  if (value.tagCount) parts.push(`tag ${value.tagCount}`);
  if (value.quoteRetweet) parts.push('quote repost');
  if (value.joinDiscord) parts.push('join Discord');
  return parts.length > 0 ? parts.join(', ') : 'No clear instructions detected';
}
