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

  getRouteForRole(role: AgentRole): { provider: IModelProvider; model: string } {
    const route = this.routingTable[role] || this.routingTable['coordinator'];
    if (!route) {
      throw new ProviderError(`No model route configured for agent role [${role}]`, 'router');
    }

    const providerInstance = this.providers.get(route.provider);
    if (!providerInstance) {
      throw new ProviderError(
        `Provider '${route.provider}' is configured for role '${role}' but is not registered or credentials are missing`,
        route.provider
      );
    }

    return { provider: providerInstance, model: route.model };
  }

  async executeForRole(role: AgentRole, request: Omit<ProviderRequest, 'model'>): Promise<ProviderResponse> {
    const { provider, model } = this.getRouteForRole(role);
    const fullRequest: ProviderRequest = {
      ...request,
      model,
    };
    return provider.complete(fullRequest);
  }

  async streamForRole(
    role: AgentRole,
    request: Omit<ProviderRequest, 'model'>,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    const { provider, model } = this.getRouteForRole(role);
    const fullRequest: ProviderRequest = {
      ...request,
      model,
    };
    return provider.stream(fullRequest, onChunk);
  }
}

export const globalModelRouter = new ModelRouter();
globalModelRouter.initializeFromStorage();
