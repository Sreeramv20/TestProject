import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { RuntimeContext } from './config/types';
import type { TweetCandidate } from './types';
import { JsonDatabase } from './storage/JsonDatabase';
import { AiService } from './services/AiService';
import { InstructionParser } from './parsers/InstructionParser';
import { TwitterAutomation } from './automation/TwitterAutomation';
import { DiscordNotifier } from './notifications/DiscordNotifier';
import { GiveawayService } from './services/GiveawayService';
import { Scheduler } from './services/Scheduler';
import { logger } from './utils/logger';

export async function createApp(context: RuntimeContext): Promise<{
  app: express.Express;
  scheduler: Scheduler;
}> {
  const database = new JsonDatabase(context.paths.databasePath);
  await database.init();

  const aiService = new AiService(context.config.ai, context.env);
  const parser = new InstructionParser(aiService);
  const automation = new TwitterAutomation(context.config, context.env, aiService);
  const notifier = new DiscordNotifier(context.env);
  const giveawayService = new GiveawayService(
    context,
    database,
    automation,
    parser,
    notifier,
  );
  const scheduler = new Scheduler(
    giveawayService,
    context.config.automation.pollIntervalSeconds,
  );

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      status: scheduler.getStatus(),
      stats: giveawayService.getStats(),
      dryRun: context.config.automation.dryRun,
    });
  });

  app.post('/api/bot/start', async (_req, res, next) => {
    try {
      await scheduler.start();
      res.json(scheduler.getStatus());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bot/stop', async (_req, res, next) => {
    try {
      await scheduler.stop();
      res.json(scheduler.getStatus());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bot/poll', async (_req, res, next) => {
    try {
      await giveawayService.poll();
      res.json({ ok: true, status: scheduler.getStatus() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/entries', (_req, res) => {
    res.json(giveawayService.getEntries());
  });

  app.get('/api/failures', (_req, res) => {
    res.json(database.getFailures());
  });

  app.get('/api/stats', (_req, res) => {
    res.json(giveawayService.getStats());
  });

  app.get('/api/logs', async (_req, res) => {
    res.type('text/plain').send(await readRecentLog(context.paths.logPath));
  });

  app.get('/api/config', (_req, res) => {
    res.json(giveawayService.getConfig());
  });

  app.patch('/api/config/automation', async (req, res, next) => {
    try {
      const config = await giveawayService.updateConfig((current) => {
        current.automation = {
          ...current.automation,
          ...req.body,
        };
      });
      res.json(config.automation);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config/search/terms', async (req, res, next) => {
    try {
      const term = String(req.body.term ?? '').trim();
      if (!term) {
        res.status(400).json({ error: 'term is required' });
        return;
      }
      const config = await giveawayService.updateConfig((current) => {
        if (!current.search.terms.includes(term)) {
          current.search.terms.push(term);
        }
      });
      res.json(config.search);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/config/search/terms/:term', async (req, res, next) => {
    try {
      const config = await giveawayService.updateConfig((current) => {
        current.search.terms = current.search.terms.filter(
          (term) => term !== req.params.term,
        );
      });
      res.json(config.search);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config/search/accounts', async (req, res, next) => {
    try {
      const account = String(req.body.account ?? '').replace('@', '').trim();
      if (!account) {
        res.status(400).json({ error: 'account is required' });
        return;
      }
      const config = await giveawayService.updateConfig((current) => {
        if (!current.search.accounts.includes(account)) {
          current.search.accounts.push(account);
        }
      });
      res.json(config.search);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/config/search/accounts/:account', async (req, res, next) => {
    try {
      const config = await giveawayService.updateConfig((current) => {
        current.search.accounts = current.search.accounts.filter(
          (account) => account !== req.params.account,
        );
      });
      res.json(config.search);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/test/parse', async (req, res, next) => {
    try {
      const tweet = buildTestTweet(req.body.text, req.body.authorHandle);
      res.json(await parser.parse(tweet));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/test/process', async (req, res, next) => {
    try {
      const tweet = buildTestTweet(req.body.text, req.body.authorHandle);
      res.json(await giveawayService.processTweet(tweet));
    } catch (error) {
      next(error);
    }
  });

  const dashboardDir = path.resolve(process.cwd(), 'dist', 'dashboard');
  app.use(express.static(dashboardDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dashboardDir, 'index.html'), (error) => {
      if (error) {
        res.status(404).send('Dashboard is not built yet. Run npm run build.');
      }
    });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('API request failed', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  return { app, scheduler };
}

async function readRecentLog(logPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(logPath, 'utf8');
    return raw.split('\n').slice(-300).join('\n');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function buildTestTweet(text: string, authorHandle = 'pokemon'): TweetCandidate {
  if (!text) {
    throw new Error('text is required');
  }
  return {
    id: `test-${Date.now()}`,
    url: 'https://x.com/example/status/0000000000',
    text,
    authorHandle,
    discoveredAt: new Date().toISOString(),
    source: 'search',
    sourceQuery: 'manual-test',
  };
}
