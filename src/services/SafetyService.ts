import type { SafetyConfig } from '../config/types';
import type { ParsedInstructions, TweetCandidate } from '../types';

export class SafetyService {
  constructor(private readonly config: SafetyConfig) {}

  evaluate(tweet: TweetCandidate, instructions: ParsedInstructions): string[] {
    const text = tweet.text.toLowerCase();
    const reasons = new Set(instructions.skippedReasons);
    const author = normalizeHandle(tweet.authorHandle);

    if (this.config.blacklistAccounts.map(normalizeHandle).includes(author)) {
      reasons.add('blacklisted_account');
    }

    for (const keyword of this.config.blockedKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        reasons.add(`blocked_keyword:${keyword}`);
      }
    }

    if (
      this.config.requiredKeywords.length > 0
      && !this.config.requiredKeywords.some((keyword) => text.includes(keyword.toLowerCase()))
    ) {
      reasons.add('missing_required_keyword');
    }

    if (this.config.skipPurchaseRequired && instructions.skippedReasons.includes('purchase_required')) {
      reasons.add('purchase_required');
    }

    if (this.config.skipCryptoNft && instructions.skippedReasons.includes('crypto_or_nft')) {
      reasons.add('crypto_or_nft');
    }

    if (this.config.skipExternalJoinRequired && instructions.joinDiscord) {
      reasons.add('external_join_required');
    }

    if (instructions.confidence < this.config.minParserConfidence) {
      reasons.add('low_parser_confidence');
    }

    return [...reasons];
  }
}

function normalizeHandle(handle: string): string {
  return handle.startsWith('@') ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
}
