import { StorageEngine, ActiveTaskRegistry } from '../../packages/server/dist/index.js';
import { NexusEventBus } from '../../packages/core/dist/index.js';
import os from 'node:os';
import path from 'node:path';

console.log('====================================================');
console.log('  R5: TASK RUNNER & LIFECYCLE AUDIT');
console.log('====================================================\n');

const storage = new StorageEngine();
const eventBus = new NexusEventBus();
const registry = new ActiveTaskRegistry(eventBus, storage);

const taskId = `diag_task_${Date.now()}`;
const abortCtrl = new AbortController();

console.log(`[1/3] Registering task: ${taskId}`);
const entry = registry.register(taskId, {
  sessionId: 'diag_sess',
  prompt: 'Diagnostic task',
  workspaceRoot: process.cwd(),
  abortController: abortCtrl,
  provider: 'gemini',
  model: 'gemini-2.5-flash',
});

console.log(`Initial status: ${entry.status}, stage: ${entry.stage}`);

console.log('\n[2/3] Updating stage to coding');
registry.updateStage(taskId, 'coding', 'coder', 'Implementing test code');
const active = registry.get(taskId);
console.log(`Updated stage: ${active?.stage}, role: ${active?.agentRole}`);

console.log('\n[3/3] Completing task');
registry.complete(taskId, 'Diagnostic task completed successfully');
console.log(`Is active in registry: ${registry.has(taskId)}`);
console.log(`Total active tasks: ${registry.listActive().length}`);
