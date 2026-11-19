import { app } from './app.js';
import { env } from './config/env.js';

const port = env.PORT;

const server = app.listen(port, () => {
  console.log(`[Matinee Backend] Server listening on port ${port} in ${env.NODE_ENV} mode`);
  console.log(`[Matinee Backend] Health probe available at http://localhost:${port}${env.API_PREFIX}/health`);
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

