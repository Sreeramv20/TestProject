import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AppConfig } from './types';
import type { EnvConfig } from './types';

const appConfigSchema = z.object({
  search: z.object({
    terms: z.array(z.string()).default([]),
    hashtags: z.array(z.string()).default([]),
    accounts: z.array(z.string()).default([]),
    advancedQueries: z.array(z.string()).default([]),
  }),
  automation: z.object({
    startOnBoot: z.boolean().default(false),
    enabled: z.boolean().default(true),
    dryRun: z.boolean().default(true),
    pollIntervalSeconds: z.number().int().min(30).default(300),
    maxGiveawaysPerHour: z.number().int().positive().default(5),
    maxGiveawaysPerDay: z.number().int().positive().default(20),
    minDelayMs: z.number().int().nonnegative().default(2_000),
    maxDelayMs: z.number().int().nonnegative().default(9_000),
    actionCooldownMs: z.number().int().nonnegative().default(45_000),
    maxRetries: z.number().int().positive().default(3),
    retryBaseDelayMs: z.number().int().positive().default(2_500),
    headless: z.boolean().default(true),
    sessionStatePath: z.string().default('data/twitter-storage-state.json'),
    browserUserDataDir: z.string().default('data/browser-profile'),
    proxyServer: z.string().optional(),
  }),
  safety: z.object({
    blacklistAccounts: z.array(z.string()).default([]),
    blockedKeywords: z.array(z.string()).default([]),
    requiredKeywords: z.array(z.string()).default([]),
    skipPurchaseRequired: z.boolean().default(true),
    skipCryptoNft: z.boolean().default(true),
    skipExternalJoinRequired: z.boolean().default(false),
    minParserConfidence: z.number().min(0).max(1).default(0.45),
  }),
  replies: z.object({
    templates: z.array(z.string()).default([]),
    quoteTemplates: z.array(z.string()).default([]),
    pokemonFavorites: z.array(z.string()).default([]),
    usernamesForTagging: z.array(z.string()).default([]),
  }),
  ai: z.object({
    enabled: z.boolean().default(false),
    model: z.string().default('gpt-4o-mini'),
    baseUrl: z.string().url().optional(),
    temperature: z.number().min(0).max(2).default(0.1),
    maxTokens: z.number().int().positive().default(700),
  }),
  dashboard: z.object({
    enabled: z.boolean().default(true),
  }),
});

export async function loadConfig(env: EnvConfig): Promise<AppConfig> {
  const configPath = path.resolve(process.cwd(), env.CONFIG_PATH);
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = appConfigSchema.parse(JSON.parse(raw));

  return {
    ...parsed,
    automation: {
      ...parsed.automation,
      dryRun: env.DRY_RUN || parsed.automation.dryRun,
      headless: env.HEADLESS && parsed.automation.headless,
    },
    ai: {
      ...parsed.ai,
      baseUrl: env.OPENAI_BASE_URL ?? parsed.ai.baseUrl,
      model: env.OPENAI_MODEL ?? parsed.ai.model,
    },
  };
}

export async function writeConfig(configPath: string, config: AppConfig): Promise<void> {
  await fs.writeFile(
    path.resolve(process.cwd(), configPath),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}
