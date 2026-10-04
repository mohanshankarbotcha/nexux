import { Router, Request, Response, NextFunction } from 'express';
import { maskKey, ProviderError, ProviderId } from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';
import { globalModelRouter } from '../../providers/model-router.js';
import { OpenAIProvider } from '../../providers/openai-provider.js';
import { GeminiProvider } from '../../providers/gemini-provider.js';

export function createProviderRouter(): Router {
  const router = Router();

  // Get status of configured providers (never reveals keys!)
  router.get('/status', (req: Request, res: Response) => {
    const creds = globalStorage.getCredentials();
    const openaiConfigured = Boolean(creds.openaiApiKey && creds.openaiApiKey.trim().length > 0);
    const geminiConfigured = Boolean(creds.geminiApiKey && creds.geminiApiKey.trim().length > 0);

    res.json({
      success: true,
      providers: {
        openai: {
          configured: openaiConfigured,
          id: 'openai',
          name: 'OpenAI',
          maskedKey: maskKey(creds.openaiApiKey),
        },
        gemini: {
          configured: geminiConfigured,
          id: 'gemini',
          name: 'Google Gemini',
          maskedKey: maskKey(creds.geminiApiKey),
        },
      },
      hasAnyValidProvider: openaiConfigured || geminiConfigured,
      activeProviders: [
        ...(openaiConfigured ? ['openai'] : []),
        ...(geminiConfigured ? ['gemini'] : []),
      ],
      routingTable: globalModelRouter.getRoutingTable(),
    });
  });

  // Save credentials securely
  router.post('/credentials', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { openaiApiKey, geminiApiKey } = req.body;

      // Update storage
      globalStorage.saveCredentials({
        ...(openaiApiKey !== undefined && { openaiApiKey: openaiApiKey.trim() }),
        ...(geminiApiKey !== undefined && { geminiApiKey: geminiApiKey.trim() }),
      });

      // Update active router
      if (openaiApiKey !== undefined) {
        globalModelRouter.updateCredential('openai', openaiApiKey.trim());
      }
      if (geminiApiKey !== undefined) {
        globalModelRouter.updateCredential('gemini', geminiApiKey.trim());
      }

      const creds = globalStorage.getCredentials();
      const hasOpenAI = Boolean(creds.openaiApiKey && creds.openaiApiKey.trim().length > 0);
      const hasGemini = Boolean(creds.geminiApiKey && creds.geminiApiKey.trim().length > 0);

      // Auto-adapt routing defaults based on available keys
      if (hasOpenAI && !hasGemini) {
        globalModelRouter.setRoutingTable({
          coordinator: { provider: 'openai', model: 'gpt-4o' },
          explorer: { provider: 'openai', model: 'gpt-4o-mini' },
          planner: { provider: 'openai', model: 'gpt-4o' },
          coder: { provider: 'openai', model: 'gpt-4o' },
          debugger: { provider: 'openai', model: 'gpt-4o' },
          reviewer: { provider: 'openai', model: 'gpt-4o' },
        });
      } else if (hasGemini && !hasOpenAI) {
        globalModelRouter.setRoutingTable({
          coordinator: { provider: 'gemini', model: 'gemini-2.5-flash' },
          explorer: { provider: 'gemini', model: 'gemini-2.5-flash' },
          planner: { provider: 'gemini', model: 'gemini-2.5-flash' },
          coder: { provider: 'gemini', model: 'gemini-2.5-flash' },
          debugger: { provider: 'gemini', model: 'gemini-2.5-flash' },
          reviewer: { provider: 'gemini', model: 'gemini-2.5-flash' },
        });
      }

      res.json({
        success: true,
        message: 'Credentials updated successfully',
        hasAnyValidProvider: hasOpenAI || hasGemini,
      });
    } catch (err) {
      next(err);
    }
  });

  // Validate provider credentials
  router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider: providerId, apiKey } = req.body;

      if (!providerId || (providerId !== 'openai' && providerId !== 'gemini')) {
        throw new ProviderError('Invalid provider ID. Must be "openai" or "gemini"', 'router');
      }

      let validator: { validateCredentials(): Promise<any> };

      if (apiKey) {
        // Test key supplied directly in request
        validator =
          providerId === 'openai'
            ? new OpenAIProvider({ apiKey: apiKey.trim() })
            : new GeminiProvider({ apiKey: apiKey.trim() });
      } else {
        // Test stored key
        const provider = globalModelRouter.getProvider(providerId as ProviderId);
        if (!provider) {
          throw new ProviderError(`Provider '${providerId}' not registered`, providerId);
        }
        validator = provider;
      }

      const result = await validator.validateCredentials();
      res.json({
        success: result.isValid,
        result,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
