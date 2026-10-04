import { createNexusApp } from './api/app.js';
import { DEFAULT_SERVER_CONFIG, logger } from '@nexus/core';

export * from './providers/base-provider.js';
export * from './providers/openai-provider.js';
export * from './providers/gemini-provider.js';
export * from './providers/model-router.js';
export * from './tools/index.js';
export * from './agent/base-agent.js';
export * from './workspace/workspace-service.js';
export * from './storage/storage-engine.js';
export * from './api/app.js';

export function startNexusServer(port: number = DEFAULT_SERVER_CONFIG.defaultPort) {
  const app = createNexusApp();
  const server = app.listen(port, () => {
    logger.info(`NEXUS.AI Server listening on http://localhost:${port}`);
  });
  return server;
}

// Auto-start if directly run
const isMain = process.argv[1]?.endsWith('dist/index.js') || process.argv[1]?.endsWith('src/index.ts');
if (isMain) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_SERVER_CONFIG.defaultPort;
  startNexusServer(port);
}
