import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  StorageEngine,
} from './storage-engine.js';
import {
  NexusEvent,
  Session,
  Task,
} from '@nexus/core';

function setupTestStorage() {
  const uniqueId = `nexus_storage_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tempDir = path.join(os.tmpdir(), uniqueId);
  fs.mkdirSync(tempDir, { recursive: true });

  const storage = new StorageEngine(tempDir);

  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { storage, tempDir, cleanup };
}

test('Storage Suite / Session Lifecycle & Workspace Association', async (t) => {
  const { storage, cleanup } = setupTestStorage();
  try {
    await t.test('creates and retrieves sessions for workspaces', () => {
      const wsPath = 'C:/projects/demo-app';
      const wsId = 'ws_demo_1';

      const session1 = storage.getOrCreateSession(wsId, wsPath, 'Feature Authentication');
      assert.ok(session1.id);
      assert.equal(session1.workspaceId, wsId);
      assert.equal(session1.workspacePath, wsPath);
      assert.equal(session1.title, 'Feature Authentication');

      // Second call returns existing recent session
      const session2 = storage.getOrCreateSession(wsId, wsPath);
      assert.equal(session2.id, session1.id);

      // Filtering sessions by workspace
      const wsSessions = storage.getSessionsForWorkspace(wsPath);
      assert.equal(wsSessions.length, 1);
      assert.equal(wsSessions[0].id, session1.id);
    });

    await t.test('deletes a session and its associated tasks', () => {
      const session = storage.getOrCreateSession('ws_del', 'C:/del-test');
      const task: Task = {
        id: `task_del_${Date.now()}`,
        sessionId: session.id,
        prompt: 'Task to delete',
        status: 'completed',
        changedFiles: [],
        activeAgents: [],
        createdAt: Date.now(),
      };
      storage.saveTask(task);
      assert.ok(storage.getTask(task.id));

      const deleted = storage.deleteSession(session.id);
      assert.equal(deleted, true);
      assert.equal(storage.getSession(session.id), undefined);
      assert.equal(storage.getTask(task.id), undefined);
    });
  } finally {
    cleanup();
  }
});

test('Storage Suite / Task State, Timestamps, and Provider Metadata', async (t) => {
  const { storage, cleanup } = setupTestStorage();
  try {
    const session = storage.getOrCreateSession('ws_task', 'C:/projects/task-test');
    const taskId = `task_full_${Date.now()}`;
    const startTime = Date.now() - 5000;
    const completedTime = Date.now();

    const task: Task = {
      id: taskId,
      sessionId: session.id,
      prompt: 'Refactor database models and add migration',
      status: 'completed',
      currentAgentRole: 'reviewer',
      plan: {
        summary: 'Refactor plan',
        createdAt: startTime,
        steps: [
          { id: 'step_1', description: 'Inspect schema', status: 'completed' },
          { id: 'step_2', description: 'Generate migration', status: 'completed' },
        ],
      },
      changedFiles: [
        {
          filePath: 'C:/projects/task-test/src/models/user.ts',
          relativePath: 'src/models/user.ts',
          changeType: 'modified',
          timestamp: completedTime,
        },
      ],
      activeAgents: [{ role: 'coder', status: 'idle', currentTaskDescription: 'Finished' }],
      resultSummary: 'Successfully updated models with full type safety.',
      createdAt: startTime,
      startedAt: startTime,
      updatedAt: completedTime,
      completedAt: completedTime,
      providerMetadata: {
        provider: 'openai',
        model: 'gpt-4o',
        plannerModel: 'gpt-4o',
        coderModel: 'gpt-4o',
        reviewerModel: 'gpt-4o',
      },
    };

    storage.saveTask(task);

    // Retrieve task and verify full persistence
    const loaded = storage.getTask(taskId);
    assert.ok(loaded);
    assert.equal(loaded.id, taskId);
    assert.equal(loaded.status, 'completed');
    assert.equal(loaded.startedAt, startTime);
    assert.equal(loaded.completedAt, completedTime);
    assert.equal(loaded.providerMetadata?.provider, 'openai');
    assert.equal(loaded.providerMetadata?.model, 'gpt-4o');
    assert.equal(loaded.changedFiles.length, 1);
    assert.equal(loaded.changedFiles[0].relativePath, 'src/models/user.ts');
    assert.equal(loaded.resultSummary, 'Successfully updated models with full type safety.');
    assert.equal(loaded.plan?.steps.length, 2);

    // Verify session was updated with this task ID
    const updatedSession = storage.getSession(session.id);
    assert.ok(updatedSession?.taskIds.includes(taskId));
    assert.equal(updatedSession?.activeTaskId, taskId);
  } finally {
    cleanup();
  }
});

test('Storage Suite / Event Stream Persistence and Secret Redaction', async (t) => {
  const { storage, cleanup } = setupTestStorage();
  try {
    const taskId = `task_evt_${Date.now()}`;

    const event1: NexusEvent = {
      id: 'evt_1',
      type: 'agent_started',
      sessionId: 'sess_1',
      taskId,
      timestamp: 1000,
      agentRole: 'planner',
      goal: 'Initial prompt',
    };

    // Event with secret that must be sanitized before persistence
    const event2: NexusEvent = {
      id: 'evt_2',
      type: 'agent_message',
      sessionId: 'sess_1',
      taskId,
      timestamp: 2000,
      agentRole: 'coder',
      content: 'Request failed with apiKey: sk-proj-1234567890abcdef1234567890 in header',
    };

    storage.appendTaskEvent(taskId, event1);
    storage.appendTaskEvent(taskId, event2);

    const events = storage.getTaskEvents(taskId);
    assert.equal(events.length, 2);
    assert.equal(events[0].id, 'evt_1');
    assert.equal(events[1].id, 'evt_2');

    // Verify secret was redacted on disk
    const msgEvt = events[1] as any;
    assert.ok(!msgEvt.content?.includes('1234567890abcdef1234567890'));
    assert.ok(msgEvt.content?.includes('[REDACTED]'));
  } finally {
    cleanup();
  }
});

test('Storage Suite / Interrupted Task State Recovery on Startup', async () => {
  const uniqueId = `nexus_recover_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tempDir = path.join(os.tmpdir(), uniqueId);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. First engine instance creates an uncompleted 'running' task
    const storage1 = new StorageEngine(tempDir);
    const interruptedTaskId = `task_interrupted_${Date.now()}`;
    const task: Task = {
      id: interruptedTaskId,
      sessionId: 'sess_interrupted',
      prompt: 'Unfinished work before crash',
      status: 'running',
      changedFiles: [],
      activeAgents: [],
      createdAt: Date.now() - 10000,
      startedAt: Date.now() - 10000,
    };
    storage1.saveTask(task);

    // Verify initial status is running
    assert.equal(storage1.getTask(interruptedTaskId)?.status, 'running');

    // 2. Simulate server restart: new StorageEngine boots on existing directory
    const storage2 = new StorageEngine(tempDir);
    const recoveredTask = storage2.getTask(interruptedTaskId);

    assert.ok(recoveredTask);
    assert.equal(recoveredTask.status, 'failed');
    assert.ok(recoveredTask.error?.includes('interrupted'));
    assert.ok(recoveredTask.completedAt);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
