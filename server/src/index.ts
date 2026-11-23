import { app } from './app.js';
import { env } from './config/env.js';
import { enforceStartupSafety } from './config/databaseIsolation.js';

const port = env.PORT;

async function bootstrap(): Promise<void> {
  try {
    // Phase 2: Enforce startup database isolation and pre-flight connectivity BEFORE listening
    const safetyReport = await enforceStartupSafety();
    console.log(
      `[Matinee Backend] Database isolation verified (mode=${safetyReport.deploymentMode}, host=${safetyReport.sanitizedHost})`
    );

    const server = app.listen(port, () => {
      console.log(`[Matinee Backend] Server listening on port ${port} in ${env.NODE_ENV} mode`);
      console.log(
        `[Matinee Backend] Health probe available at http://localhost:${port}${env.API_PREFIX}/health`
      );
      console.log(
        `[Matinee Backend] Readiness probe available at http://localhost:${port}${env.API_PREFIX}/ready`
      );
    });

    // Graceful Shutdown Handlers
    function handleShutdown(signal: string) {
      console.log(`[Matinee Backend] Received ${signal}. Commencing graceful shutdown...`);
      server.close(() => {
        console.log('[Matinee Backend] HTTP server closed cleanly.');
        process.exit(0);
      });

      // Force shutdown after timeout if pending connections hang
      setTimeout(() => {
        console.error('[Matinee Backend] Forced shutdown due to timeout.');
        process.exit(1);
      }, 10000).unref();
    }

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error: any) {
    console.error(`[Matinee Startup Guard] CRITICAL: Server startup aborted.`);
    console.error(`[Matinee Startup Guard] ${error.message}`);
    process.exit(1);
  }
}

bootstrap();

