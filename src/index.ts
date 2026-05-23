import { createApp } from './server';
import { loadRuntimeContext } from './config/runtime';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const context = await loadRuntimeContext();
  const { app, scheduler } = await createApp(context);

  const server = app.listen(context.env.PORT, () => {
    logger.info('Pokemon giveaway bot API listening', {
      port: context.env.PORT,
      dryRun: context.env.DRY_RUN,
      headless: context.env.HEADLESS,
    });
  });

  if (context.config.automation.startOnBoot) {
    await scheduler.start();
  }

  const shutdown = async (signal: string) => {
    logger.info('Shutdown requested', { signal });
    await scheduler.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap().catch((error) => {
  logger.error('Fatal startup failure', { error });
  process.exit(1);
});
