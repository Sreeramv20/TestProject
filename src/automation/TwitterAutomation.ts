import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import type { AppConfig, EnvConfig } from '../config/types';
import type { ActionResult, ParsedInstructions, TweetCandidate } from '../types';
import { humanType, randomDelay } from '../utils/delay';
import { fillTemplate, pickRandom, sample } from '../utils/random';
import { logger } from '../utils/logger';
import type { AiService } from '../services/AiService';

export class TwitterAutomation {
  private context?: BrowserContext;

  constructor(
    private readonly config: AppConfig,
    private readonly env: EnvConfig,
    private readonly aiService: AiService,
  ) {}

  async start(): Promise<void> {
    if (this.config.automation.dryRun || this.context) {
      return;
    }

    this.context = await chromium.launchPersistentContext(
      path.resolve(this.config.automation.browserUserDataDir),
      {
        headless: this.config.automation.headless,
        viewport: { width: 1365, height: 900 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        proxy: this.config.automation.proxyServer
          ? { server: this.config.automation.proxyServer }
          : undefined,
      },
    );
    this.context.setDefaultTimeout(15_000);
  }

  async stop(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
  }

  async discoverTweets(): Promise<TweetCandidate[]> {
    if (this.config.automation.dryRun) {
      return [];
    }

    await this.start();
    const page = await this.newPage();
    const candidates: TweetCandidate[] = [];

    try {
      await this.ensureLoggedIn(page);

      for (const query of this.buildQueries()) {
        candidates.push(...(await this.search(page, query)));
        await this.pause();
      }

      for (const account of this.config.search.accounts) {
        candidates.push(...(await this.scanAccount(page, account)));
        await this.pause();
      }
    } finally {
      await page.close();
    }

    return dedupeTweets(candidates);
  }

  async executeGiveaway(
    tweet: TweetCandidate,
    instructions: ParsedInstructions,
  ): Promise<ActionResult[]> {
    if (this.config.automation.dryRun) {
      return this.buildDryRunActions(instructions);
    }

    await this.start();
    const page = await this.newPage();
    const results: ActionResult[] = [];

    try {
      await this.ensureLoggedIn(page);

      for (const handle of instructions.follow) {
        results.push(await this.capture('follow', () => this.follow(page, handle)));
        await this.pause();
      }

      await page.goto(tweet.url, { waitUntil: 'domcontentloaded' });
      await this.waitForTweet(page);

      if (instructions.like) {
        results.push(await this.capture('like', () => this.clickTestId(page, 'like')));
        await this.pause();
      }

      if (instructions.retweet) {
        results.push(await this.capture('retweet', () => this.retweet(page)));
        await this.pause();
      }

      if (instructions.reply || instructions.tagCount > 0) {
        const reply = await this.buildReply(tweet, instructions);
        results.push(await this.capture('reply', () => this.reply(page, reply)));
        await this.pause();
      }

      if (instructions.quoteRetweet) {
        const quote = pickRandom(this.config.replies.quoteTemplates);
        results.push(await this.capture('quoteRetweet', () => this.quoteRetweet(page, quote)));
        await this.pause();
      }

      for (const link of instructions.visitLinks.slice(0, 2)) {
        results.push(await this.capture('visitLink', () => this.visitLink(link)));
        await this.pause();
      }
    } finally {
      await page.close();
    }

    return results;
  }

  private async ensureLoggedIn(page: Page): Promise<void> {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    if (await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count()) {
      return;
    }

    if (!this.env.TWITTER_USERNAME || !this.env.TWITTER_PASSWORD) {
      throw new Error('Twitter/X session is not logged in and credentials are not configured');
    }

    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/phone, email, or username/i).fill(this.env.TWITTER_USERNAME);
    await page.getByRole('button', { name: /next/i }).click();

    if (this.env.TWITTER_EMAIL && await page.getByText(/enter your phone number or email/i).count()) {
      await page.getByLabel(/phone or email/i).fill(this.env.TWITTER_EMAIL);
      await page.getByRole('button', { name: /next/i }).click();
    }

    await page.getByLabel(/password/i).fill(this.env.TWITTER_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForTimeout(5_000);

    if (await page.getByText(/captcha|unusual|verify/i).count()) {
      throw new Error('Twitter/X is requesting captcha or manual verification');
    }
  }

  private buildQueries(): string[] {
    return [
      ...this.config.search.terms,
      ...this.config.search.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)),
      ...this.config.search.advancedQueries,
    ].filter(Boolean);
  }

  private async search(page: Page, query: string): Promise<TweetCandidate[]> {
    const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.waitForTweet(page);
    return this.extractTweets(page, 'search', query);
  }

  private async scanAccount(page: Page, account: string): Promise<TweetCandidate[]> {
    const handle = account.replace('@', '');
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded' });
    await this.waitForTweet(page);
    return this.extractTweets(page, 'account', handle);
  }

  private async extractTweets(
    page: Page,
    source: TweetCandidate['source'],
    sourceQuery: string,
  ): Promise<TweetCandidate[]> {
    const articles = await page.locator('article').all();
    const tweets: TweetCandidate[] = [];

    for (const article of articles.slice(0, 20)) {
      const text = (await article.textContent())?.trim() ?? '';
      const statusLink = await article
        .locator('a[href*="/status/"]')
        .first()
        .getAttribute('href')
        .catch(() => undefined);
      const match = statusLink?.match(/\/([^/]+)\/status\/(\d+)/);
      if (!match || !text) {
        continue;
      }

      tweets.push({
        id: match[2],
        url: `https://x.com${statusLink}`,
        text,
        authorHandle: match[1],
        discoveredAt: new Date().toISOString(),
        source,
        sourceQuery,
      });
    }

    return tweets;
  }

  private async follow(page: Page, handle: string): Promise<void> {
    await page.goto(`https://x.com/${handle.replace('@', '')}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^follow$/i }).first().click();
  }

  private async retweet(page: Page): Promise<void> {
    await this.clickTestId(page, 'retweet');
    await page.getByTestId('retweetConfirm').click();
  }

  private async reply(page: Page, text: string): Promise<void> {
    await this.clickTestId(page, 'reply');
    const textbox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await textbox.click();
    await humanType(textbox, text);
    await page.getByTestId('tweetButton').click();
  }

  private async quoteRetweet(page: Page, text: string): Promise<void> {
    await this.clickTestId(page, 'retweet');
    await page.getByRole('menuitem', { name: /quote/i }).click();
    const textbox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await textbox.click();
    await humanType(textbox, text);
    await page.getByTestId('tweetButton').click();
  }

  private async visitLink(link: string): Promise<void> {
    const page = await this.newPage();
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } finally {
      await page.close();
    }
  }

  private async buildReply(
    tweet: TweetCandidate,
    instructions: ParsedInstructions,
  ): Promise<string> {
    const base = await this.aiService.generateReply(tweet, instructions, this.config.replies);
    const tags = sample(this.config.replies.usernamesForTagging, instructions.tagCount)
      .map((handle) => (handle.startsWith('@') ? handle : `@${handle}`));
    return [base, ...tags].join(' ').trim();
  }

  private async clickTestId(page: Page, testId: string): Promise<void> {
    await page.getByTestId(testId).first().click();
  }

  private async capture(action: ActionResult['action'], operation: () => Promise<void>): Promise<ActionResult> {
    try {
      await operation();
      return { action, ok: true };
    } catch (error) {
      return {
        action,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async waitForTweet(page: Page): Promise<void> {
    await page.locator('article').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  }

  private async pause(): Promise<void> {
    await randomDelay(this.config.automation.minDelayMs, this.config.automation.maxDelayMs);
  }

  private async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context is not started');
    }
    return this.context.newPage();
  }

  private buildDryRunActions(instructions: ParsedInstructions): ActionResult[] {
    const actions: ActionResult[] = [];
    for (const handle of instructions.follow) {
      actions.push({ action: 'follow', ok: true, detail: `Would follow ${handle}` });
    }
    if (instructions.like) actions.push({ action: 'like', ok: true, detail: 'Would like tweet' });
    if (instructions.retweet) actions.push({ action: 'retweet', ok: true, detail: 'Would repost tweet' });
    if (instructions.reply || instructions.tagCount > 0) {
      actions.push({ action: 'reply', ok: true, detail: 'Would reply with configured template and tags' });
    }
    if (instructions.quoteRetweet) {
      actions.push({ action: 'quoteRetweet', ok: true, detail: 'Would quote repost tweet' });
    }
    for (const link of instructions.visitLinks) {
      actions.push({ action: 'visitLink', ok: true, detail: `Would visit ${link}` });
    }
    if (instructions.joinDiscord) {
      actions.push({ action: 'joinDiscord', ok: true, detail: 'Would join Discord if configured' });
    }
    return actions;
  }
}

function dedupeTweets(tweets: TweetCandidate[]): TweetCandidate[] {
  const seen = new Set<string>();
  const result: TweetCandidate[] = [];
  for (const tweet of tweets) {
    if (seen.has(tweet.id)) {
      continue;
    }
    seen.add(tweet.id);
    result.push(tweet);
  }
  logger.info('Discovered Twitter/X candidates', { count: result.length });
  return result;
}
