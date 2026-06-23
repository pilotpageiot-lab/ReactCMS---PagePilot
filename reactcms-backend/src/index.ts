import { config } from './config';
import { logger } from './lib/logger';
import { testConnection, pool } from './lib/db/pool';
import { connectRedis, redis } from './lib/redis';


async function bootstrap() {
  await testConnection();
  await connectRedis();

  // Dynamic import: rateLimit.middleware.ts creates RedisStore at module
  // load time, so Redis must be connected before the app module graph loads.
  const { createApp } = await import('./app');
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(`ReactCMS API running`, {
      port: config.PORT,
      env: config.NODE_ENV,
    });
  });

  // Scheduled publishing — check every 60 seconds
  const { publishScheduledItems } = await import('./modules/content/content.service');
  const schedulerInterval = setInterval(async () => {
    try {
      const count = await publishScheduledItems();
      if (count > 0) logger.info(`Scheduler: published ${count} scheduled item(s)`);
    } catch (err) {
      logger.error('Scheduler error', { error: (err as Error).message });
    }
  }, 60_000);

  // ── Graceful shutdown ──────────────────────────────────
  async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);
    clearInterval(schedulerInterval);
    server.close(async () => {
      await pool.end();
      await redis.quit();
      logger.info('Server closed');
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
