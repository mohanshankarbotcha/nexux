import http from 'node:http';
import { globalEventBus, NexusEventBus } from '../../packages/core/dist/index.js';

console.log('====================================================');
console.log('  R6: EVENT TRANSPORT HEADLESS CLIENT AUDIT');
console.log('====================================================\n');

// 1. In-process SSE formatting & parsing test
console.log('[1/2] SSE Formatting & Parsing In-Memory Test');
const testEvt = {
  id: 'evt_test_123',
  type: 'task_started',
  sessionId: 'sess_1',
  taskId: 'task_1',
  timestamp: Date.now(),
  prompt: 'Test prompt',
};

const sseFormatted = NexusEventBus.formatSSE(testEvt);
console.log('SSE formatted payload:');
console.log(sseFormatted.trim());

const dataMatch = sseFormatted.match(/^data: (.*)$/m);
if (dataMatch) {
  const parsed = JSON.parse(dataMatch[1]);
  console.log(`Parsed event type: ${parsed.type}, taskId: ${parsed.taskId}`);
  console.log('In-memory SSE formatting verified.');
} else {
  console.log('FAILED to match data line in SSE');
}

// 2. HTTP SSE streaming test
console.log('\n[2/2] Testing Local Server SSE Endpoint');
const req = http.get('http://127.0.0.1:3000/api/tasks/events/all', (res) => {
  console.log(`SSE HTTP Status: ${res.statusCode}`);
  console.log(`Content-Type: ${res.headers['content-type']}`);
  res.on('data', (chunk) => {
    console.log(`Received SSE chunk from server: ${chunk.toString().trim()}`);
    res.destroy();
  });
});

req.on('error', (err) => {
  console.log(`SSE request failed (server might be offline): ${err.message}`);
});

setTimeout(() => {
  req.destroy();
  console.log('R6 test finished.');
  process.exit(0);
}, 2000);
