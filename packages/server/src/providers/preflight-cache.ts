import {
  ProviderValidationResult,
  logger,
} from '@nexus/core';
import { IModelProvider } from './base-provider.js';

export interface ModelValidationResult {
  provider: string;
  model: string;
  isValid: boolean;
  message?: string;
  code?: string;
  testedAt: number;
}

export class ProviderPreflightCache {
  private credentialCache = new Map<string, { result: ProviderValidationResult; timestamp: number }>();
  private modelCache = new Map<string, { result: ModelValidationResult; timestamp: number }>();
  private readonly defaultTtlMs = 10 * 60 * 1000; // 10 minutes

  /**
   * Validates provider credentials using in-memory cache when fresh.
   * Drops preflight overhead from ~800ms to < 1ms on repeat tasks.
   */
  async validateWithCache(
    provider: IModelProvider,
    force = false,
    ttlMs: number = this.defaultTtlMs
  ): Promise<ProviderValidationResult> {
    const key = provider.id;
    const now = Date.now();

    if (!force) {
      const cached = this.credentialCache.get(key);
      if (cached && cached.result.isValid && now - cached.timestamp < ttlMs) {
        logger.debug(`ProviderPreflightCache: Cache hit for provider '${key}' credential check`);
        return cached.result;
      }
    }

    const result = await provider.validateCredentials();
    if (result.isValid) {
      this.credentialCache.set(key, { result, timestamp: now });
    } else {
      this.credentialCache.delete(key);
    }

    return result;
  }

  /**
   * Validates model availability with in-memory caching.
   */
  async validateModelWithCache(
    provider: IModelProvider,
    model: string,
    force = false,
    ttlMs: number = this.defaultTtlMs
  ): Promise<ModelValidationResult> {
    const key = `${provider.id}:${model}`;
    const now = Date.now();

    if (!force) {
      const cached = this.modelCache.get(key);
      if (cached && cached.result.isValid && now - cached.timestamp < ttlMs) {
        logger.debug(`ProviderPreflightCache: Cache hit for model '${key}' availability check`);
        return cached.result;
      }
    }

    let result: ModelValidationResult;
    if (typeof (provider as any).validateModel === 'function') {
      const rawRes = await (provider as any).validateModel(model);
      result = {
        provider: provider.id,
        model,
        isValid: rawRes.isValid ?? true,
        message: rawRes.message,
        code: rawRes.code,
        testedAt: now,
      };
    } else {
      result = {
        provider: provider.id,
        model,
        isValid: true,
        testedAt: now,
      };
    }

    if (result.isValid) {
      this.modelCache.set(key, { result, timestamp: now });
    } else {
      this.modelCache.delete(key);
    }

    return result;
  }

  /**
   * Invalidates cached entries (e.g. when user updates API keys in settings).
   */
  invalidate(providerId?: string): void {
    if (providerId) {
      this.credentialCache.delete(providerId);
      for (const key of this.modelCache.keys()) {
        if (key.startsWith(`${providerId}:`)) {
          this.modelCache.delete(key);
        }
      }
      logger.info(`ProviderPreflightCache: Invalidated cache for provider '${providerId}'`);
    } else {
      this.credentialCache.clear();
      this.modelCache.clear();
      logger.info('ProviderPreflightCache: Invalidation cleared all cached credentials and models');
    }
  }
}

export const globalPreflightCache = new ProviderPreflightCache();
