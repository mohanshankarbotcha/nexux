export type ProviderId = 'openai' | 'gemini';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isEstimated?: boolean;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: string; // JSON string
  }[];
  toolCallId?: string;
  name?: string;
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ProviderRequest {
  requestId: string;
  model: string;
  messages: ProviderMessage[];
  systemInstruction?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface ProviderResponse {
  requestId: string;
  provider: ProviderId;
  model: string;
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }[];
  usage: TokenUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | 'other';
  durationMs: number;
}

export interface StreamChunk {
  requestId: string;
  deltaText?: string;
  deltaToolCalls?: {
    index: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
  }[];
  finishReason?: string;
  usage?: TokenUsage;
}

export interface ProviderCredentials {
  openaiApiKey?: string;
  geminiApiKey?: string;
}

export interface ProviderValidationResult {
  provider: ProviderId;
  isValid: boolean;
  message: string;
  availableModels?: string[];
  testedAt: number;
}

export interface RoleModelRoute {
  provider: ProviderId;
  model: string;
}

export type ModelRoutingTable = Record<string, RoleModelRoute>;
