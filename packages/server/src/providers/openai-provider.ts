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

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
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
        message: 'OpenAI API key is not configured',
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
        const msg = (errorData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        return {
          provider: 'openai',
          isValid: false,
          message: `Validation failed: ${msg}`,
          testedAt,
        };
      }

      const data = (await res.json()) as { data?: { id: string }[] };
      const availableModels = data.data?.map((m) => m.id).slice(0, 15) || [];

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
        message: `Network error during validation: ${err instanceof Error ? err.message : String(err)}`,
        testedAt,
      };
    }
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

  private formatMessages(request: ProviderRequest) {
    const messages: any[] = [];

    if (request.systemInstruction) {
      messages.push({
        role: 'system',
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
    const payload: any = {
      model: request.model,
      messages: this.formatMessages(request),
      temperature: request.temperature ?? 0.2,
    };

    if (request.maxOutputTokens) {
      payload.max_tokens = request.maxOutputTokens;
    }

    const tools = this.formatTools(request.tools);
    if (tools) {
      payload.tools = tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs || 90_000);

    if (request.abortSignal) {
      request.abortSignal.addEventListener('abort', () => controller.abort());
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
        const errMsg = (errJson as any)?.error?.message || `HTTP ${res.status}`;
        const code = res.status === 401 ? 'PROVIDER_AUTH_FAILED' : res.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REQUEST_FAILED';
        throw new ProviderError(`OpenAI completion failed: ${errMsg}`, 'openai', code, res.status, errJson);
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
    const payload: any = {
      model: request.model,
      messages: this.formatMessages(request),
      temperature: request.temperature ?? 0.2,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.maxOutputTokens) {
      payload.max_tokens = request.maxOutputTokens;
    }

    const tools = this.formatTools(request.tools);
    if (tools) {
      payload.tools = tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs || 90_000);

    if (request.abortSignal) {
      request.abortSignal.addEventListener('abort', () => controller.abort());
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
        const errMsg = (errJson as any)?.error?.message || `HTTP ${res.status}`;
        const code = res.status === 401 ? 'PROVIDER_AUTH_FAILED' : res.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REQUEST_FAILED';
        throw new ProviderError(`OpenAI streaming failed: ${errMsg}`, 'openai', code, res.status, errJson);
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
