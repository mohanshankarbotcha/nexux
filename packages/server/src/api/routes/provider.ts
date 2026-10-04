import { Router, Request, Response, NextFunction } from 'express';
import { globalStorage } from '../../storage/storage-engine.js';
import { globalModelRouter } from '../../providers/model-router.js';

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
        },
        gemini: {
          configured: geminiConfigured,
          id: 'gemini',
          name: 'Google Gemini',
        },
      },
      hasAnyValidProvider: openaiConfigured || geminiConfigured,
      routingTable: globalModelRouter.getRoutingTable(),
    });
  });

  // Save credentials securely
  router.post('/credentials', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { openaiApiKey, geminiApiKey } = req.body;
      globalStorage.saveCredentials({
        ...(openaiApiKey !== undefined && { openaiApiKey: openaiApiKey.trim() }),
        ...(geminiApiKey !== undefined && { geminiApiKey: geminiApiKey.trim() }),
      });

      res.json({
        success: true,
        message: 'Credentials updated successfully',
      });
    } catch (err) {
      next(err);
    }
  });

  // Validate provider credentials
  router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider: providerId } = req.body;
      const provider = globalModelRouter.getProvider(providerId);

      if (!provider) {
        res.status(400).json({
          success: false,
          error: `Provider '${providerId}' not found or not initialized`,
        });
        return;
      }

      const result = await provider.validateCredentials();
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
