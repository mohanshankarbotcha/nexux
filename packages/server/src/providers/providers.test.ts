import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from './openai-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { ModelRouter } from './model-router.js';
import { ProviderError, StreamChunk } from '@nexus/core';

test('OpenAIProvider - validateCredentials with valid key', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    return new Response(
      JSON.stringify({
        data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
      }),
      { status: 200 }
    );
  };

  const provider = new OpenAIProvider({
    apiKey: 'sk-valid-test-key-1234567890',
    fetchFn: mockFetch,
  });

  const res = await provider.validateCredentials();
  assert.equal(res.isValid, true);
  assert.ok(res.availableModels?.includes('gpt-4o'));
});

test('OpenAIProvider - validateCredentials with invalid key', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    return new Response(
      JSON.stringify({
        error: { message: 'Incorrect API key provided' },
      }),
      { status: 401 }
    );
  };

  const provider = new OpenAIProvider({
    apiKey: 'sk-invalid-key-1234567890',
    fetchFn: mockFetch,
  });

  const res = await provider.validateCredentials();
  assert.equal(res.isValid, false);
  assert.ok(res.message.includes('Incorrect API key provided'));
});

test('OpenAIProvider - complete() executes request and returns usage and tool calls', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, 'gpt-4o');
    assert.equal(body.messages[0].content, 'Please check index.ts');

    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ filePath: 'src/index.ts' }),
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
      }),
      { status: 200 }
    );
  };

  const provider = new OpenAIProvider({
    apiKey: 'sk-test-key-1234567890',
    fetchFn: mockFetch,
  });

  const response = await provider.complete({
    requestId: 'req-test-1',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Please check index.ts' }],
    tools: [
      {
        name: 'read_file',
        description: 'Read file content',
        parameters: {
          type: 'object',
          properties: { filePath: { type: 'string' } },
          required: ['filePath'],
        },
      },
    ],
  });

  assert.equal(response.requestId, 'req-test-1');
  assert.equal(response.provider, 'openai');
  assert.equal(response.toolCalls?.length, 1);
  assert.equal(response.toolCalls?.[0].name, 'read_file');
  assert.deepEqual(response.toolCalls?.[0].arguments, { filePath: 'src/index.ts' });
  assert.equal(response.usage.totalTokens, 40);
});

test('OpenAIProvider - stream() streams deltas and accumulates response', async () => {
  const streamChunks = [
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" world!"}}]}\n\n',
    'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
    'data: [DONE]\n\n',
  ];

  const mockFetch: typeof fetch = async () => {
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of streamChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };

  const provider = new OpenAIProvider({
    apiKey: 'sk-test-key-1234567890',
    fetchFn: mockFetch,
  });

  const streamedDeltas: string[] = [];
  const response = await provider.stream(
    {
      requestId: 'req-stream-1',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hello' }],
    },
    (chunk) => {
      if (chunk.deltaText) streamedDeltas.push(chunk.deltaText);
    }
  );

  assert.equal(response.content, 'Hello world!');
  assert.deepEqual(streamedDeltas, ['Hello', ' world!']);
  assert.equal(response.usage.totalTokens, 15);
});

test('GeminiProvider - validateCredentials with valid key', async () => {
  const mockFetch: typeof fetch = async (url) => {
    assert.ok(String(url).includes('key=AIzaValidKey'));
    return new Response(
      JSON.stringify({
        models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-pro' }],
      }),
      { status: 200 }
    );
  };

  const provider = new GeminiProvider({
    apiKey: 'AIzaValidKey1234567890abcdef',
    fetchFn: mockFetch,
  });

  const res = await provider.validateCredentials();
  assert.equal(res.isValid, true);
  assert.ok(res.availableModels?.includes('gemini-2.5-flash'));
});

test('GeminiProvider - complete() executes request and returns function calls', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string);
    assert.equal(body.contents[0].parts[0].text, 'List all files');

    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'list_files',
                    args: { directoryPath: '.' },
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 18,
          totalTokenCount: 30,
        },
      }),
      { status: 200 }
    );
  };

  const provider = new GeminiProvider({
    apiKey: 'AIzaValidKey1234567890abcdef',
    fetchFn: mockFetch,
  });

  const response = await provider.complete({
    requestId: 'gemini-req-1',
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'List all files' }],
    tools: [
      {
        name: 'list_files',
        description: 'List workspace files',
        parameters: {
          type: 'object',
          properties: { directoryPath: { type: 'string' } },
        },
      },
    ],
  });

  assert.equal(response.requestId, 'gemini-req-1');
  assert.equal(response.provider, 'gemini');
  assert.equal(response.toolCalls?.length, 1);
  assert.equal(response.toolCalls?.[0].name, 'list_files');
  assert.deepEqual(response.toolCalls?.[0].arguments, { directoryPath: '.' });
  assert.equal(response.usage.totalTokens, 30);
});

test('GeminiProvider - stream() streams text parts and handles usage', async () => {
  const streamChunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Processing "}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"repository..."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":8,"candidatesTokenCount":12,"totalTokenCount":20}}\n\n',
  ];

  const mockFetch: typeof fetch = async () => {
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of streamChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };

  const provider = new GeminiProvider({
    apiKey: 'AIzaValidKey1234567890abcdef',
    fetchFn: mockFetch,
  });

  const deltas: string[] = [];
  const response = await provider.stream(
    {
      requestId: 'gemini-stream-1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Scan repository' }],
    },
    (chunk) => {
      if (chunk.deltaText) deltas.push(chunk.deltaText);
    }
  );

  assert.equal(response.content, 'Processing repository...');
  assert.deepEqual(deltas, ['Processing ', 'repository...']);
  assert.equal(response.usage.totalTokens, 20);
});

test('ModelRouter - routes different agent roles to configured providers and models', async () => {
  const router = new ModelRouter();

  const mockOpenAI = new OpenAIProvider({
    apiKey: 'sk-mock',
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OpenAI coder response' } }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
        { status: 200 }
      ),
  });

  const mockGemini = new GeminiProvider({
    apiKey: 'AIza-mock',
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Gemini coordinator response' }] } }],
          usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 14, totalTokenCount: 20 },
        }),
        { status: 200 }
      ),
  });

  router.registerProvider(mockOpenAI);
  router.registerProvider(mockGemini);

  router.setRoutingTable({
    coordinator: { provider: 'gemini', model: 'gemini-2.5-flash' },
    coder: { provider: 'openai', model: 'gpt-4o' },
  });

  // Coordinator route
  const coordRes = await router.executeForRole('coordinator', {
    requestId: 'r1',
    messages: [{ role: 'user', content: 'coordinate' }],
  });
  assert.equal(coordRes.provider, 'gemini');
  assert.equal(coordRes.model, 'gemini-2.5-flash');
  assert.equal(coordRes.content, 'Gemini coordinator response');

  // Coder route
  const coderRes = await router.executeForRole('coder', {
    requestId: 'r2',
    messages: [{ role: 'user', content: 'code' }],
  });
  assert.equal(coderRes.provider, 'openai');
  assert.equal(coderRes.model, 'gpt-4o');
  assert.equal(coderRes.content, 'OpenAI coder response');
});
