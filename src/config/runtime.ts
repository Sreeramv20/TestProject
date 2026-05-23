import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './configLoader';
import { loadEnv } from './env';
import type { RuntimeContext } from './types';

export async function loadRuntimeContext(): Promise<RuntimeContext> {
  const env = loadEnv();
  const config = await loadConfig(env);
  const dataDir = path.resolve(process.cwd(), env.DATA_DIR);
  const logPath = path.join(dataDir, 'logs', 'app.log');

  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(config.automation.sessionStatePath)), {
    recursive: true,
  });
  await fs.mkdir(path.resolve(config.automation.browserUserDataDir), {
    recursive: true,
  });

  return {
    env,
    config,
    paths: {
      dataDir,
      databasePath: path.join(dataDir, 'giveaways.json'),
      logPath,
    },
  };
}
