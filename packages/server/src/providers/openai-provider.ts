import {
  IModelProvider,
} from './base-provider.js';
import {
  ProviderId,
  ProviderRequest,
  ProviderResponse,
  ProviderValidationResult,
  StreamChunk,
  TokenUsage,
  ProviderError,
  logger,
  ToolDefinition,
  isPlaceholderOrFixtureKey,
  sanitizeErrorMessage,
} from '@nexus/core';

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class OpenAIProvider implements IModelProvider {
  readonly id: ProviderId = 'openai';
  readonly name = 'OpenAI';

  private apiKey?: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private cachedModels: string[] = [];
  private modelsCachedAt = 0;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
    this.cachedModels = [];
    this.modelsCachedAt = 0;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  async validateCredentials(): Promise<ProviderValidationResult> {
    const testedAt = Date.now();
    if (!this.apiKey) {
      return {
        provider: 'openai',
        isValid: false,
        code: 'PROVIDER_AUTH_FAILED',
        message: 'OpenAI API key is not configured',
        testedAt,
      };
    }

    if (isPlaceholderOrFixtureKey(this.apiKey)) {
      return {
        provider: 'openai',
        isValid: false,
        code: 'PROVIDER_AUTH_FAILED',
        message: 'Placeholder or test fixture OpenAI API key detected. Please configure a valid OpenAI API key in Settings.',
        testedAt,
      };
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const rawMsg = (errorData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        const cleanMsg = sanitizeErrorMessage(rawMsg).replace(/\.+$/, '');
        return {
          provider: 'openai',
          isValid: false,
          code: res.status === 401 ? 'PROVIDER_AUTH_FAILED' : 'PROVIDER_REQUEST_FAILED',
          message: `Validation failed: ${cleanMsg}`,
          testedAt,
        };
      }

      const data = (await res.json()) as { data?: { id: string }[] };
      const allModels = data.data?.map((m) => m.id) || [];
      this.cachedModels = allModels;
      this.modelsCachedAt = testedAt;

      const priorityModels = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'].filter((m) => allModels.includes(m));
      const availableModels = priorityModels.length > 0 ? priorityModels : allModels.slice(0, 15);

      return {
        provider: 'openai',
        isValid: true,
        message: 'OpenAI credentials validated successfully',
        availableModels,
        testedAt,
      };
    } catch (err: unknown) {
      return {
        provider: 'openai',
        isValid: false,
        code: 'NETWORK_ERROR',
        message: `Network error during validation: ${sanitizeErrorMessage(err instanceof Error ? err.message : String(err))}`,
        testedAt,
      };
    }
  }

  async validateModel(model: string): Promise<ProviderValidationResult> {
    const testedAt = Date.now();
    if (this.cachedModels.length === 0 || testedAt - this.modelsCachedAt > 300_000) {
      const credVal = await this.validateCredentials();
      if (!credVal.isValid) return credVal;
    }

    const isAvailable = this.cachedModels.includes(model);
    if (!isAvailable) {
      const suggested = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'].filter((m) => this.cachedModels.includes(m));
      return {
        provider: 'openai',
        isValid: false,
        code: 'MODEL_UNAVAILABLE',
        message: `The model '${model}' does not exist or is not accessible on your OpenAI account. Available models: ${suggested.join(', ')}.`,
        availableModels: suggested,
        testedAt,
      };
    }

    // Model existence verified via cached metadata (GET /models)
    return {
      provider: 'openai',
      isValid: true,
      message: `Model '${model}' is accessible on OpenAI`,
      testedAt,
    };
  }

  private formatTools(tools?: ToolDefinition[]) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private isReasoningModel(model: string): boolean {
    const m = model.toLowerCase();
    return m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4');
  }

  private formatMessages(request: ProviderRequest) {
    const messages: any[] = [];
    const isReasoning = this.isReasoningModel(request.model);

    if (request.systemInstruction) {
      messages.push({
        role: isReasoning ? 'developer' : 'system',
        content: request.systemInstruction,
      });
    }

    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || null };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }
        messages.push(assistantMsg);
      } else {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return messages;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new ProviderError('OpenAI API key is missing', 'openai', 'PROVIDER_NOT_CONFIGURED', 401);
    }

    const startTime = Date.now();
    const isReasoning = this.isReasoningModel(request.model);
    const payload: any = {
      model: request.model,
      messages: this.formatMessages(request),
    };

    if (!isReasoning) {
      payload.temperature = request.temperature ?? 0.2;
    }

    if (request.maxOutputTokens) {
      if (isReasoning) {
        payload.max_completion_tokens = request.maxOutputTokens;
      } else {
        payload.max_tokens = request.maxOutputTokens;
      }
    }

    const tools = this.formatTools(request.tools);
    if (tools) {
      payload.tools = tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs || 90_000);

    if (request.abortSignal) {
      if (request.abortSignal.aborted) {
        controller.abort();
      } else {
        request.abortSignal.addEventListener('abort', () => controller.abort());
      }
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const rawMsg = (errJson as any)?.error?.message || `HTTP ${res.status}`;
        const cleanMsg = sanitizeErrorMessage(rawMsg).replace(/\.+$/, '');
        const code =
          res.status === 401
            ? 'PROVIDER_AUTH_FAILED'
            : res.status === 404 || cleanMsg.toLowerCase().includes('does not exist') || cleanMsg.toLowerCase().includes('not have access')
            ? 'MODEL_UNAVAILABLE'
            : res.status === 429
            ? 'PROVIDER_RATE_LIMIT'
            : 'PROVIDER_REQUEST_FAILED';
        throw new ProviderError(`OpenAI completion failed: ${cleanMsg}`, 'openai', code, res.status, errJson);
      }

      const data = (await res.json()) as any;
      const choice = data.choices?.[0];
      const durationMs = Date.now() - startTime;

      let toolCalls: any[] | undefined = undefined;
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        toolCalls = choice.message.tool_calls.map((tc: any) => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs,
          };
        });
      }

      const usage: TokenUsage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
        isEstimated: false,
      };

      return {
        requestId: request.requestId,
        provider: 'openai',
        model: request.model,
        content: choice?.message?.content || '',
        toolCalls,
        usage,
        finishReason: choice?.finish_reason || 'stop',
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (request.abortSignal?.aborted || (err as any)?.name === 'AbortError') {
        throw new Error('Task was cancelled');
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
        'openai',
        'PROVIDER_REQUEST_FAILED',
        500
      );
    }
  }

  async stream(
    request: ProviderRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new ProviderError('OpenAI API key is missing', 'openai', 'PROVIDER_NOT_CONFIGURED', 401);
    }

    const startTime = Date.now();
    const isReasoning = this.isReasoningModel(request.model);
    const payload: any = {
      model: request.model,
      messages: this.formatMessages(request),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (!isReasoning) {
      payload.temperature = request.temperature ?? 0.2;
    }

    if (request.maxOutputTokens) {
      if (isReasoning) {
        payload.max_completion_tokens = request.maxOutputTokens;
      } else {
        payload.max_tokens = request.maxOutputTokens;
      }
    }

    const tools = this.formatTools(request.tools);
    if (tools) {
      payload.tools = tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs || 90_000);

    if (request.abortSignal) {
      if (request.abortSignal.aborted) {
        controller.abort();
      } else {
        request.abortSignal.addEventListener('abort', () => controller.abort());
      }
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const rawMsg = (errJson as any)?.error?.message || `HTTP ${res.status}`;
        const cleanMsg = sanitizeErrorMessage(rawMsg).replace(/\.+$/, '');
        const code =
          res.status === 401
            ? 'PROVIDER_AUTH_FAILED'
            : res.status === 404 || cleanMsg.toLowerCase().includes('does not exist') || cleanMsg.toLowerCase().includes('not have access')
            ? 'MODEL_UNAVAILABLE'
            : res.status === 429
            ? 'PROVIDER_RATE_LIMIT'
            : 'PROVIDER_REQUEST_FAILED';
        throw new ProviderError(`OpenAI streaming failed: ${cleanMsg}`, 'openai', code, res.status, errJson);
      }

      if (!res.body) {
        throw new ProviderError('Empty response body from OpenAI', 'openai');
      }

      let accumulatedContent = '';
      const toolCallsMap = new Map<number, { id: string; name: string; argumentsJson: string }>();
      let finalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, isEstimated: true };
      let finishReason: any = 'stop';

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.usage) {
              finalUsage = {
                inputTokens: parsed.usage.prompt_tokens ?? 0,
                outputTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
                isEstimated: false,
              };
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (delta?.content) {
              accumulatedContent += delta.content;
              onChunk({
                requestId: request.requestId,
                deltaText: delta.content,
              });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                let existing = toolCallsMap.get(idx);
                if (!existing) {
                  existing = { id: tc.id || '', name: tc.function?.name || '', argumentsJson: '' };
                  toolCallsMap.set(idx, existing);
                }
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.argumentsJson += tc.function.arguments;

                onChunk({
                  requestId: request.requestId,
                  deltaToolCalls: [
                    {
                      index: idx,
                      id: tc.id,
                      name: tc.function?.name,
                      argumentsDelta: tc.function?.arguments,
                    },
                  ],
                });
              }
            }
          } catch {
            // Ignore malformed chunk
          }
        }
      }

      const formattedToolCalls = Array.from(toolCallsMap.values()).map((tc) => {
        let args = {};
        try {
          args = JSON.parse(tc.argumentsJson);
        } catch {
          args = { raw: tc.argumentsJson };
        }
        return {
          id: tc.id || `tc_${Date.now()}`,
          name: tc.name,
          arguments: args,
        };
      });

      return {
        requestId: request.requestId,
        provider: 'openai',
        model: request.model,
        content: accumulatedContent,
        toolCalls: formattedToolCalls.length > 0 ? formattedToolCalls : undefined,
        usage: finalUsage,
        finishReason,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (request.abortSignal?.aborted || (err as any)?.name === 'AbortError') {
        throw new Error('Task was cancelled');
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `OpenAI streaming failed: ${err instanceof Error ? err.message : String(err)}`,
        'openai',
        'PROVIDER_REQUEST_FAILED',
        500
      );
    }
  }
}
