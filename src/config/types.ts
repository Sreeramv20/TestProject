export interface SearchConfig {
  terms: string[];
  hashtags: string[];
  accounts: string[];
  advancedQueries: string[];
}

export interface AutomationConfig {
  startOnBoot: boolean;
  enabled: boolean;
  dryRun: boolean;
  pollIntervalSeconds: number;
  maxGiveawaysPerHour: number;
  maxGiveawaysPerDay: number;
  minDelayMs: number;
  maxDelayMs: number;
  actionCooldownMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  headless: boolean;
  sessionStatePath: string;
  browserUserDataDir: string;
  proxyServer?: string;
}

export interface SafetyConfig {
  blacklistAccounts: string[];
  blockedKeywords: string[];
  requiredKeywords: string[];
  skipPurchaseRequired: boolean;
  skipCryptoNft: boolean;
  skipExternalJoinRequired: boolean;
  minParserConfidence: number;
}

export interface ReplyConfig {
  templates: string[];
  quoteTemplates: string[];
  pokemonFavorites: string[];
  usernamesForTagging: string[];
}

export interface AiConfig {
  enabled: boolean;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
}

export interface DashboardConfig {
  enabled: boolean;
}

export interface AppConfig {
  search: SearchConfig;
  automation: AutomationConfig;
  safety: SafetyConfig;
  replies: ReplyConfig;
  ai: AiConfig;
  dashboard: DashboardConfig;
}

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  CONFIG_PATH: string;
  DATA_DIR: string;
  LOG_LEVEL: string;
  TWITTER_USERNAME?: string;
  TWITTER_PASSWORD?: string;
  TWITTER_EMAIL?: string;
  DISCORD_WEBHOOK_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  DRY_RUN: boolean;
  HEADLESS: boolean;
}

export interface RuntimeContext {
  env: EnvConfig;
  config: AppConfig;
  paths: {
    dataDir: string;
    databasePath: string;
    logPath: string;
  };
}
