export type ActionName =
  | 'follow'
  | 'like'
  | 'retweet'
  | 'reply'
  | 'tagFriends'
  | 'quoteRetweet'
  | 'joinDiscord'
  | 'visitLink';

export interface TweetCandidate {
  id: string;
  url: string;
  text: string;
  authorHandle: string;
  authorName?: string;
  discoveredAt: string;
  source: 'search' | 'account';
  sourceQuery: string;
  metrics?: {
    likes?: number;
    reposts?: number;
    replies?: number;
  };
}

export interface ParsedInstructions {
  follow: string[];
  like: boolean;
  retweet: boolean;
  reply: boolean;
  replyPrompt?: string;
  tagCount: number;
  quoteRetweet: boolean;
  quotePrompt?: string;
  joinDiscord: boolean;
  visitLinks: string[];
  extraEntryHints: string[];
  confidence: number;
  highValue: boolean;
  rawSummary: string;
  skippedReasons: string[];
}

export interface ActionResult {
  action: ActionName;
  ok: boolean;
  detail?: string;
  error?: string;
}

export interface GiveawayEntry {
  id: string;
  tweetId: string;
  tweetUrl: string;
  authorHandle: string;
  text: string;
  parsedInstructions: ParsedInstructions;
  actions: ActionResult[];
  status: 'entered' | 'skipped' | 'failed' | 'dry-run';
  dryRun: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FailureRecord {
  id: string;
  tweetId?: string;
  tweetUrl?: string;
  action?: ActionName;
  message: string;
  createdAt: string;
  recoverable: boolean;
}

export interface BotStats {
  totalEntries: number;
  dryRunEntries: number;
  skipped: number;
  failures: number;
  enteredLastHour: number;
  enteredToday: number;
}

export interface BotStatus {
  running: boolean;
  queueDepth: number;
  startedAt?: string;
  lastPollAt?: string;
  nextPollAt?: string;
}
