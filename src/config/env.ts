import dotenv from 'dotenv';
import { z } from 'zod';
import type { EnvConfig } from './types';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CONFIG_PATH: z.string().default('config/config.json'),
  DATA_DIR: z.string().default('data'),
  LOG_LEVEL: z.string().default('info'),
  TWITTER_USERNAME: z.string().optional(),
  TWITTER_PASSWORD: z.string().optional(),
  TWITTER_EMAIL: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().optional(),
  DRY_RUN: z.coerce.boolean().default(true),
  HEADLESS: z.coerce.boolean().default(true),
});

export function loadEnv(): EnvConfig {
  return envSchema.parse(process.env);
}
