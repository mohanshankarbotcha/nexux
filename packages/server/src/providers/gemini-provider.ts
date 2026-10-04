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

export interface GeminiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GeminiProvider implements IModelProvider {
  readonly id: ProviderId = 'gemini';
  readonly name = 'Google Gemini';

  private apiKey?: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
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
        provider: 'gemini',
        isValid: false,
        message: 'Gemini API key is not configured',
        testedAt,
      };
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'GET',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = (errorData as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        return {
          provider: 'gemini',
          isValid: false,
          message: `Validation failed: ${msg}`,
          testedAt,
        };
      }

      const data = (await res.json()) as { models?: { name: string }[] };
      const availableModels = data.models?.map((m) => m.name.replace('models/', '')).slice(0, 15) || [];

      return {
        provider: 'gemini',
        isValid: true,
        message: 'Google Gemini credentials validated successfully',
        availableModels,
        testedAt,
      };
    } catch (err: unknown) {
      return {
        provider: 'gemini',
        isValid: false,
        message: `Network error during validation: ${err instanceof Error ? err.message : String(err)}`,
        testedAt,
      };
    }
  }

  private formatTools(tools?: ToolDefinition[]) {
    if (!tools || tools.length === 0) return undefined;
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  private formatContents(request: ProviderRequest) {
    const contents: any[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        let parsedResponse: any;
        try {
          parsedResponse = JSON.parse(msg.content);
        } catch {
          parsedResponse = { result: msg.content };
        }
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool_response',
                response: parsedResponse,
              },
            },
          ],
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.arguments);
            } catch {
              parsedArgs = { raw: tc.arguments };
            }
            parts.push({
              functionCall: {
                name: tc.name,
                args: parsedArgs,
              },
            });
          }
        }
        contents.push({
          role: 'model',
          parts,
        });
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return contents;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new ProviderError('Gemini API key is missing', 'gemini', 'PROVIDER_NOT_CONFIGURED', 401);
    }

    const startTime = Date.now();
    const modelName = request.model.startsWith('models/') ? request.model : `models/${request.model}`;
    const url = `${this.baseUrl}/${modelName}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload: any = {
      contents: this.formatContents(request),
      generationConfig: {
        temperature: request.temperature ?? 0.2,
      },
    };

    if (request.maxOutputTokens) {
      payload.generationConfig.maxOutputTokens = request.maxOutputTokens;
    }

    if (request.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
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
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = (errJson as any)?.error?.message || `HTTP ${res.status}`;
        const code = res.status === 400 && errMsg.toLowerCase().includes('api_key')
          ? 'PROVIDER_AUTH_FAILED'
          : res.status === 429
          ? 'PROVIDER_RATE_LIMIT'
          : 'PROVIDER_REQUEST_FAILED';
        throw new ProviderError(`Gemini completion failed: ${errMsg}`, 'gemini', code, res.status, errJson);
      }

      const data = (await res.json()) as any;
      const candidate = data.candidates?.[0];
      const durationMs = Date.now() - startTime;

      let textContent = '';
      let toolCalls: any[] | undefined = undefined;

      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            textContent += part.text;
          }
          if (part.functionCall) {
            if (!toolCalls) toolCalls = [];
            toolCalls.push({
              id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            });
          }
        }
      }

      const usage: TokenUsage = {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
        isEstimated: false,
      };

      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: textContent,
        toolCalls,
        usage,
        finishReason: candidate?.finishReason?.toLowerCase() || 'stop',
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
        'gemini',
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
      throw new ProviderError('Gemini API key is missing', 'gemini', 'PROVIDER_NOT_CONFIGURED', 401);
    }

    const startTime = Date.now();
    const modelName = request.model.startsWith('models/') ? request.model : `models/${request.model}`;
    const url = `${this.baseUrl}/${modelName}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}&alt=sse`;

    const payload: any = {
      contents: this.formatContents(request),
      generationConfig: {
        temperature: request.temperature ?? 0.2,
      },
    };

    if (request.maxOutputTokens) {
      payload.generationConfig.maxOutputTokens = request.maxOutputTokens;
    }

    if (request.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
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
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = (errJson as any)?.error?.message || `HTTP ${res.status}`;
        const code = res.status === 400 && errMsg.toLowerCase().includes('api_key')
          ? 'PROVIDER_AUTH_FAILED'
          : res.status === 429
          ? 'PROVIDER_RATE_LIMIT'
          : 'PROVIDER_REQUEST_FAILED';
        throw new ProviderError(`Gemini streaming failed: ${errMsg}`, 'gemini', code, res.status, errJson);
      }

      if (!res.body) {
        throw new ProviderError('Empty response body from Gemini', 'gemini');
      }

      let accumulatedContent = '';
      const toolCalls: any[] = [];
      let finalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, isEstimated: true };
      let finishReason = 'stop';

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

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.usageMetadata) {
              finalUsage = {
                inputTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                outputTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
                isEstimated: false,
              };
            }

            const candidate = parsed.candidates?.[0];
            if (candidate?.finishReason) {
              finishReason = candidate.finishReason.toLowerCase();
            }

            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  accumulatedContent += part.text;
                  onChunk({
                    requestId: request.requestId,
                    deltaText: part.text,
                  });
                }
                if (part.functionCall) {
                  const callObj = {
                    id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    name: part.functionCall.name,
                    arguments: part.functionCall.args || {},
                  };
                  toolCalls.push(callObj);
                  onChunk({
                    requestId: request.requestId,
                    deltaToolCalls: [
                      {
                        index: toolCalls.length - 1,
                        id: callObj.id,
                        name: callObj.name,
                        argumentsDelta: JSON.stringify(callObj.arguments),
                      },
                    ],
                  });
                }
              }
            }
          } catch {
            // Ignore malformed chunk
          }
        }
      }

      return {
        requestId: request.requestId,
        provider: 'gemini',
        model: request.model,
        content: accumulatedContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: finalUsage,
        finishReason: finishReason as any,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Gemini streaming failed: ${err instanceof Error ? err.message : String(err)}`,
        'gemini',
        'PROVIDER_REQUEST_FAILED',
        500
      );
    }
  }
}
