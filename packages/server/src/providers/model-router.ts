import {
  AgentRole,
  DEFAULT_MODEL_ROUTING,
  ModelRoutingTable,
  RoleModelRoute,
  ProviderError,
  ProviderId,
  ProviderRequest,
  ProviderResponse,
  StreamChunk,
  logger,
} from '@nexus/core';
import { IModelProvider } from './base-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { StorageEngine, globalStorage } from '../storage/storage-engine.js';

export class ModelRouter {
  private providers = new Map<ProviderId, IModelProvider>();
  private routingTable: ModelRoutingTable = { ...DEFAULT_MODEL_ROUTING };

  registerProvider(provider: IModelProvider): void {
    this.providers.set(provider.id, provider);
    logger.info(`ModelRouter: registered provider '${provider.id}'`);
  }

  getProvider(id: ProviderId): IModelProvider | undefined {
    return this.providers.get(id);
  }

  setRoutingTable(routes: Record<string, RoleModelRoute>): void {
    this.routingTable = { ...this.routingTable, ...routes };
  }

  getRoutingTable(): ModelRoutingTable {
    return { ...this.routingTable };
  }

  initializeFromStorage(storage: StorageEngine = globalStorage): void {
    const creds = storage.getCredentials();

    const openai = new OpenAIProvider({ apiKey: creds.openaiApiKey });
    const gemini = new GeminiProvider({ apiKey: creds.geminiApiKey });

    this.registerProvider(openai);
    this.registerProvider(gemini);
  }

  updateCredential(providerId: ProviderId, apiKey: string): void {
    const provider = this.getProvider(providerId);
    if (provider && 'setApiKey' in provider) {
      (provider as any).setApiKey(apiKey);
    }
  }

  hasAnyConfiguredProvider(): boolean {
    for (const provider of this.providers.values()) {
      if ('getApiKey' in provider && (provider as any).getApiKey()) {
        return true;
      }
    }
    return false;
  }

  getRouteForRole(
    role: AgentRole,
    override?: { provider?: ProviderId; model?: string }
  ): { provider: IModelProvider; model: string } {
    const defaultRoute = this.routingTable[role] || this.routingTable['coordinator'];
    const targetProviderId = override?.provider || defaultRoute?.provider;

    let providerInstance = targetProviderId ? this.providers.get(targetProviderId) : undefined;

    // Fallback: if targeted provider is not configured or missing key, try any configured provider
    if (!providerInstance || ('getApiKey' in providerInstance && !(providerInstance as any).getApiKey())) {
      for (const p of this.providers.values()) {
        if ('getApiKey' in p && (p as any).getApiKey()) {
          providerInstance = p;
          break;
        }
      }
    }

    if (!providerInstance) {
      throw new ProviderError(
        `No configured AI model provider available. Please configure your Google Gemini or OpenAI API key in Provider Setup.`,
        'router',
        'PROVIDER_NOT_CONFIGURED',
        400
      );
    }

    const resolvedModel =
      override?.model ||
      (override?.provider && override.provider === providerInstance.id ? undefined : undefined) ||
      (defaultRoute && defaultRoute.provider === providerInstance.id ? defaultRoute.model : undefined) ||
      (providerInstance.id === 'openai' ? 'gpt-4o' : 'gemini-2.5-flash');

    return { provider: providerInstance, model: resolvedModel };
  }

  async executeForRole(
    role: AgentRole,
    request: Omit<ProviderRequest, 'model'>,
    override?: { provider?: ProviderId; model?: string }
  ): Promise<ProviderResponse> {
    const { provider, model } = this.getRouteForRole(role, override);
    const fullRequest: ProviderRequest = {
      ...request,
      model,
    };
    return provider.complete(fullRequest);
  }

  async streamForRole(
    role: AgentRole,
    request: Omit<ProviderRequest, 'model'>,
    onChunk: (chunk: StreamChunk) => void,
    override?: { provider?: ProviderId; model?: string }
  ): Promise<ProviderResponse> {
    const { provider, model } = this.getRouteForRole(role, override);
    const fullRequest: ProviderRequest = {
      ...request,
      model,
    };
    return provider.stream(fullRequest, onChunk);
  }
}

export const globalModelRouter = new ModelRouter();
globalModelRouter.initializeFromStorage();
