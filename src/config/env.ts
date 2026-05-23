import dotenv from 'dotenv';
import { z } from 'zod';
import type { EnvConfig } from './types';

dotenv.config();

const emptyStringToUndefined = (value: unknown): unknown => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

const optionalString = z.preprocess(emptyStringToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return value;
  }, z.boolean().default(defaultValue));

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CONFIG_PATH: z.string().default('config/config.json'),
  DATA_DIR: z.string().default('data'),
  LOG_LEVEL: z.string().default('info'),
  TWITTER_USERNAME: optionalString,
  TWITTER_PASSWORD: optionalString,
  TWITTER_EMAIL: optionalString,
  DISCORD_WEBHOOK_URL: optionalUrl,
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalUrl,
  OPENAI_MODEL: optionalString,
  DRY_RUN: booleanFromEnv(true),
  HEADLESS: booleanFromEnv(true),
});

export function loadEnv(): EnvConfig {
  return envSchema.parse(process.env);
}
