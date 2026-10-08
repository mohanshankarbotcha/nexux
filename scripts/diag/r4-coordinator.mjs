import { ContextEngine, WorkspaceService } from '../../packages/server/dist/index.js';
import path from 'node:path';

console.log('====================================================');
console.log('  R4: COORDINATOR PROMPT & CONTEXT BUDGET AUDIT');
console.log('====================================================\n');

const wsService = new WorkspaceService();
const currentWs = path.resolve('.');
wsService.openWorkspace(currentWs);
const contextEngine = new ContextEngine(wsService);

const prompt = 'hiii';
console.log(`Auditing task prompt: "${prompt}" in workspace: ${currentWs}`);

const contextPkg = await contextEngine.buildTaskContext(currentWs, prompt, 'test_sess', 'test_task');
console.log(`Context items count: ${contextPkg.items.length}`);
let totalChars = 0;
for (const item of contextPkg.items) {
  totalChars += item.content.length;
  console.log(` - Item: ${item.relativePath} (${item.content.length} chars)`);
}

const systemPrompt = `You are the Coordinator Agent for NEXUS.AI...`;
const totalPromptChars = totalChars + systemPrompt.length + prompt.length;
const estTokens = Math.round(totalPromptChars / 4);

console.log(`\nTotal Prompt Characters: ${totalPromptChars}`);
console.log(`Estimated Tokens: ${estTokens}`);
if (estTokens > 50000) {
  console.log('WARNING: Prompt exceeds 50,000 tokens!');
} else {
  console.log('Prompt context is well within reasonable budget (< 50k tokens).');
}
