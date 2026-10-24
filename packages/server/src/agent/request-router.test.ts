import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { globalRequestRouter } from './request-router.js';
import { globalFastPaths, FastPathContext } from './fast-paths.js';
import { RouteCategory, RouteProfile, Task } from '@nexus/core';

// 125-prompt labelled evaluation dataset
interface DatasetItem {
  prompt: string;
  expectedCategory: RouteCategory;
  expectedProfile: RouteProfile;
}

const DATASET: DatasetItem[] = [
  // --- 1. Conversation & General Knowledge (S1) - 25 prompts ---
  { prompt: 'hiii', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'hello there', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'hey nexus', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'good morning assistant', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'greetings', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'sup bro', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'howdy partner', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'What can you do?', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'what are your capabilities?', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'who are you', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'tell me about python', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'What is the difference between Python and JavaScript?', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'explain typescript types vs interfaces', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'how does docker work', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'tell me about react hooks', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'explain machine learning basics', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'kya haal hai bhai', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'bhai sun ek sawaal hai', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'namaste dosto', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'kaun ho tum batao', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'aap kaun ho ji', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'hi hello', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'hey tell me about rust memory model', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'hello what is the difference between c++ and rust', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'good evening nexus', expectedCategory: 'conversation', expectedProfile: 'S1' },

  // --- 2. Workspace Read-Only Inspection (S2) - 30 prompts ---
  { prompt: 'Go to the demo folder and tell me what files are inside it', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'Tell me what is inside the src directory', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'what files are inside the docs folder', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'show files in components', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'list files in public', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'demo folder me kya kya files hain batao', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'src folder me kya kya files hain dekh ke batao', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'Read package.json and explain the dependencies', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'open tsconfig.json and explain compiler options', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'read README.md and summarize project overview', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'check index.html', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'examine config.yaml file', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'Find all files containing the word authentication', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'search for apiKey across codebase', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'grep for handleRequest in src', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'where is token validated', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'find all files containing useState', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'tell me what is inside utils folder', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'what files are inside lib', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'show files in tests directory', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'List the files in C:/Windows', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'check files in C:/Windows/System32', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'list files in /etc/passwd', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'read server.ts', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'open style.css', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'read package-lock.json', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'what files are inside config folder', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'show files in scripts dir', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'grep for error_code in packages', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'find all files containing JWT_SECRET', expectedCategory: 'workspace_read', expectedProfile: 'S2' },

  // --- 3. Destructive & Ambiguous Requests (Clarify or Authorize) - 20 prompts ---
  { prompt: 'Delete everything in this folder', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'delete all files in the project', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'rm -rf *', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'wipe workspace completely', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'format c:', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'drop database production', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'delete everything now', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'destroy project files', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'wipe all repository content', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'delete all source code', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'Make it better', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'improve this', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'fix it', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'optimize it', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'update it please', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'refactor it', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'make it faster', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'fix this please', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'improve code quality', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'make it better now', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },

  // --- 4. Multi-step Engineering & Build Tasks (S4) - 25 prompts ---
  { prompt: 'Create a Python calculator', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build me a simple HTML page of containing of files', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement a REST API server in express', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create a react todo list app', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build a cli tool for image compression', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'write a new python scraper for stock prices', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement authentication service with jwt', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create a full-stack weather application', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build a snake game in javascript and html canvas', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'generate a markdown blog generator script', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create a python script to parse csv reports', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build me a simple dashboard in react', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement sqlite database schema and migrations', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create a unit test suite for payment processor', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'write a new rust microservice for hashing', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build a chat application with websockets', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create a landing page for our saas product', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement rate limiter middleware in node.js', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create an e-commerce shopping cart component', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build a dockerfile and docker-compose setup', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'generate an automated backup script in python', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement redis caching layer for user queries', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create a python calculator with add sub mul div functions', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build a portfolio website in next.js and tailwind', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement stripe webhook verification handler', expectedCategory: 'engineering', expectedProfile: 'S4' },

  // --- 5. Additional Realistic Informal, Typo & Non-Native English Prompts - 25 prompts ---
  { prompt: 'hiii can you help me', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'heyy there what can you do', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'batao bhai python vs javascript difference', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'namaste ji what is machine learning', expectedCategory: 'conversation', expectedProfile: 'S1' },
  { prompt: 'go to demo folder and show files', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'tell me what is inside src dir please', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'read package.json file quickly', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'check tsconfig.json file', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'find all files containing db_password', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'grep for port in src', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'build me a html page with contact form', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'create python calculator app', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'implement express server with routes', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'delete all files please', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'make it better for me', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'improve this code please', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'what files are inside test folder', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'read index.ts and explain functions', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'show files in build directory', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'demo folder me kya kya files hain batana', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'src me kya kya files hain', expectedCategory: 'workspace_read', expectedProfile: 'S2' },
  { prompt: 'create a python web scraper for news', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'build a simple html file with table of contents', expectedCategory: 'engineering', expectedProfile: 'S4' },
  { prompt: 'wipe everything in workspace', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
  { prompt: 'fix it now', expectedCategory: 'clarify_or_authorize', expectedProfile: 'S1' },
];

test('Request Router & Fast Paths Suite (Prompt 03)', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_router_test_'));

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('125-Prompt Labelled Dataset Router Evaluation', async () => {
    let correctCount = 0;
    const confusionMatrix: Record<string, Record<string, number>> = {
      conversation: { conversation: 0, workspace_read: 0, engineering: 0, clarify_or_authorize: 0 },
      workspace_read: { conversation: 0, workspace_read: 0, engineering: 0, clarify_or_authorize: 0 },
      engineering: { conversation: 0, workspace_read: 0, engineering: 0, clarify_or_authorize: 0 },
      clarify_or_authorize: { conversation: 0, workspace_read: 0, engineering: 0, clarify_or_authorize: 0 },
    };

    for (const item of DATASET) {
      const decision = await globalRequestRouter.route(item.prompt, tempDir);
      if (decision.category === item.expectedCategory) {
        correctCount++;
      }
      if (confusionMatrix[item.expectedCategory] && confusionMatrix[item.expectedCategory][decision.category] !== undefined) {
        confusionMatrix[item.expectedCategory][decision.category]++;
      }
    }

    const accuracy = (correctCount / DATASET.length) * 100;
    console.log(`[Router Eval] Dataset size: ${DATASET.length}, Correct: ${correctCount}, Accuracy: ${accuracy.toFixed(1)}%`);
    console.log('[Router Eval] Confusion Matrix:', JSON.stringify(confusionMatrix, null, 2));

    assert.ok(accuracy >= 95.0, `Expected router accuracy >= 95%, got ${accuracy.toFixed(1)}%`);
  });

  await t.test('Fast Path S1 - Direct Answer handling for capabilities & clarification', async () => {
    const dummyTask: Task = {
      id: 'task_s1_test',
      sessionId: 'sess_s1',
      prompt: 'What can you do?',
      status: 'running',
      stage: 'chatting',
      changedFiles: [],
      activeAgents: [],
      createdAt: Date.now(),
    };

    const fastContext: FastPathContext = {
      workspaceRoot: tempDir,
      sessionId: 'sess_s1',
      taskId: 'task_s1_test',
    };

    const decision = await globalRequestRouter.route('What can you do?', tempDir);
    assert.equal(decision.profile, 'S1');
    assert.equal(decision.category, 'conversation');

    // Test clarification handling
    const vagueDecision = await globalRequestRouter.route('Make it better', tempDir);
    assert.equal(vagueDecision.category, 'clarify_or_authorize');
    assert.ok(vagueDecision.clarification?.includes('specify which file or aspect'));

    const clarifyReply = await globalFastPaths.executeS1(dummyTask, fastContext, vagueDecision);
    assert.ok(clarifyReply.includes('specify which file or aspect'));
    assert.equal(dummyTask.status, 'completed');
  });

  await t.test('Fast Path S2 - Outside Workspace refusal', async () => {
    const dummyTask: Task = {
      id: 'task_s2_outside',
      sessionId: 'sess_s2',
      prompt: 'List the files in C:/Windows',
      status: 'running',
      stage: 'inspecting',
      changedFiles: [],
      activeAgents: [],
      createdAt: Date.now(),
    };

    const fastContext: FastPathContext = {
      workspaceRoot: tempDir,
      sessionId: 'sess_s2',
      taskId: 'task_s2_outside',
    };

    const decision = await globalRequestRouter.route('List the files in C:/Windows', tempDir);
    assert.equal(decision.profile, 'S2');
    assert.equal(decision.risk, 'high');

    const reply = await globalFastPaths.executeS2(dummyTask, fastContext, decision);
    assert.ok(reply.includes('Access denied'));
    assert.ok(reply.includes('outside the authorized project workspace boundary'));
    assert.equal(dummyTask.status, 'completed');
  });

  await t.test('Destructive prompt requires high-risk authorization', async () => {
    const decision = await globalRequestRouter.route('Delete everything in this folder', tempDir);
    assert.equal(decision.category, 'clarify_or_authorize');
    assert.equal(decision.risk, 'high');
    assert.ok(decision.clarification?.includes('destructive'));
  });
});
