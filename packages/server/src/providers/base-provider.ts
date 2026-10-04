import {
  ProviderId,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  StreamChunk,
} from '@nexus/core';

export interface IModelProvider {
  readonly id: ProviderId;
  readonly name: string;

  /**
   * Validates if credentials are configured and functional.
   */
  validateCredentials(): Promise<ProviderValidationResult>;

  /**
   * Executes a complete completion / tool calling request.
   */
  complete(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Streams completion tokens and tool calls.
   */
  stream(
    request: ProviderRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse>;
}
