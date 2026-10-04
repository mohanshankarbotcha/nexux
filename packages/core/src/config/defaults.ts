import { ModelRoutingTable } from '../types/provider.js';

export const DEFAULT_MODEL_ROUTING: ModelRoutingTable = {
  coordinator: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  explorer: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  planner: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  coder: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  debugger: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  reviewer: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
};

export const DEFAULT_TOOL_CONFIG = {
  terminalTimeoutMs: 60_000, // 60 seconds max
  terminalMaxOutputBytes: 512 * 1024, // 512 KB
  maxFileSizeReadBytes: 2 * 1024 * 1024, // 2 MB
  maxSearchMatches: 100,
  maxFileListCount: 2000,
};

export const DEFAULT_SERVER_CONFIG = {
  defaultPort: 4173,
  apiPrefix: '/api',
};
