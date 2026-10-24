import { Router, Request, Response, NextFunction } from 'express';
import { maskKey, ProviderError, ProviderId, isPlaceholderOrFixtureKey } from '@nexus/core';
import { globalStorage } from '../../storage/storage-engine.js';
import { globalModelRouter } from '../../providers/model-router.js';
import { OpenAIProvider } from '../../providers/openai-provider.js';
import { GeminiProvider } from '../../providers/gemini-provider.js';
import { globalPreflightCache } from '../../providers/preflight-cache.js';

export function createProviderRouter(): Router {
  const router = Router();

  // Get status of configured providers (never reveals keys!)
  router.get('/status', (req: Request, res: Response) => {
    const creds = globalStorage.getCredentials();
    const openaiHasKey = Boolean(
      creds.openaiApiKey && creds.openaiApiKey.trim().length > 0 && !isPlaceholderOrFixtureKey(creds.openaiApiKey)
    );
    const geminiHasKey = Boolean(
      creds.geminiApiKey && creds.geminiApiKey.trim().length > 0 && !isPlaceholderOrFixtureKey(creds.geminiApiKey)
    );

    res.json({
      success: true,
      providers: {
        openai: {
          configured: openaiHasKey,
          status: openaiHasKey ? 'VALID' : 'NOT_CONFIGURED',
          id: 'openai',
          name: 'OpenAI',
          maskedKey: maskKey(creds.openaiApiKey),
          models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
          defaultModel: 'gpt-4o',
        },
        gemini: {
          configured: geminiHasKey,
          status: geminiHasKey ? 'VALID' : 'NOT_CONFIGURED',
          id: 'gemini',
          name: 'Google Gemini',
          maskedKey: maskKey(creds.geminiApiKey),
          models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
          defaultModel: 'gemini-2.5-flash',
        },
      },
      hasAnyValidProvider: openaiHasKey || geminiHasKey,
      activeProviders: [
        ...(openaiHasKey ? ['openai'] : []),
        ...(geminiHasKey ? ['gemini'] : []),
      ],
      routingTable: globalModelRouter.getRoutingTable(),
    });
  });

  // Save credentials securely
  router.post('/credentials', (req: Request, res: Response, next: NextFunction) => {
    try {
      let { openaiApiKey, geminiApiKey, provider, apiKey } = req.body;

      if (provider === 'openai' && apiKey !== undefined) {
        openaiApiKey = apiKey;
      } else if (provider === 'gemini' && apiKey !== undefined) {
        geminiApiKey = apiKey;
      }

      // Update storage
      globalStorage.saveCredentials({
        ...(openaiApiKey !== undefined && { openaiApiKey: openaiApiKey.trim() }),
        ...(geminiApiKey !== undefined && { geminiApiKey: geminiApiKey.trim() }),
      });

      // Update active router and invalidate preflight cache
      if (openaiApiKey !== undefined) {
        globalModelRouter.updateCredential('openai', openaiApiKey.trim());
        globalPreflightCache.invalidate('openai');
      }
      if (geminiApiKey !== undefined) {
        globalModelRouter.updateCredential('gemini', geminiApiKey.trim());
        globalPreflightCache.invalidate('gemini');
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

      let result;
      if (req.body.model && typeof (validator as any).validateModel === 'function') {
        result = await (validator as any).validateModel(req.body.model);
      } else {
        result = await validator.validateCredentials();
      }

      res.json({
        success: result.isValid,
        result,
        validation: result,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
