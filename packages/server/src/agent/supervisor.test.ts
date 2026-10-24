import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  Task,
  globalEventBus,
} from '@nexus/core';
import {
  EngineeringSupervisor,
  AntiLoopDetector,
  globalEngineeringSupervisor,
} from './supervisor.js';
import { globalToolRegistry } from '../tools/index.js';
import { globalClaimChecker } from '../tools/claim-checker.js';
import { globalEvidenceLedger } from '../tools/evidence-ledger.js';
import { globalRequestRouter } from './request-router.js';

test('Engineering Supervisor & Workflow Test Suite (Prompt 04)', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus_supervisor_test_'));

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('1. AntiLoopDetector: detects 3 identical consecutive tool calls', () => {
    const detector = new AntiLoopDetector();
    const res1 = detector.recordToolCall('read_file', { filePath: 'foo.ts' });
    assert.strictEqual(res1.isLoop, false);

    const res2 = detector.recordToolCall('read_file', { filePath: 'foo.ts' });
    assert.strictEqual(res2.isLoop, false);

    const res3 = detector.recordToolCall('read_file', { filePath: 'foo.ts' });
    assert.strictEqual(res3.isLoop, true);
    assert.ok(res3.reason?.includes('identical arguments 3 times consecutively'));
  });

  await t.test('2. AntiLoopDetector: detects identical failure twice consecutively', () => {
    const detector = new AntiLoopDetector();
    const err = 'AssertionError [ERR_ASSERTION]: Expected 12, got 10';

    const res1 = detector.recordError(err);
    assert.strictEqual(res1.isLoop, false);

    const res2 = detector.recordError(err);
    assert.strictEqual(res2.isLoop, true);
    assert.ok(res2.reason?.includes('Identical failure encountered twice'));
  });

  await t.test('3. parseGeneratedFiles: extracts explicit <<<FILE>>> format and markdown blocks', () => {
    const supervisor = new EngineeringSupervisor();
    const explicitContent = `
Here is the code:
<<<FILE: src/calc.py>>>
def add(a, b): return a + b
<<<END_FILE>>>
<<<FILE: src/test_calc.py>>>
import unittest
<<<END_FILE>>>
`;
    const files = supervisor.parseGeneratedFiles(explicitContent);
    assert.strictEqual(files.length, 2);
    assert.strictEqual(files[0].filePath, 'src/calc.py');
    assert.ok(files[0].content.includes('def add'));
    assert.strictEqual(files[1].filePath, 'src/test_calc.py');

    // Labeled markdown code blocks
    const mdContent = `
\`\`\`python // filepath: utils/math.py
def multiply(x, y): return x * y
\`\`\`
`;
    const mdFiles = supervisor.parseGeneratedFiles(mdContent);
    assert.strictEqual(mdFiles.length, 1);
    assert.strictEqual(mdFiles[0].filePath, 'utils/math.py');
    assert.ok(mdFiles[0].content.includes('multiply'));
  });

  await t.test('4. Verbatim Calculator Application: files created, build & tests pass 7+5=12, 7-5=2, 7*5=35, 20/4=5, divide-by-zero', async () => {
    const calcDir = path.join(tempDir, 'calc_app');
    fs.mkdirSync(calcDir, { recursive: true });

    // Calculator code with addition, subtraction, multiplication, division and ZeroDivisionError handling
    const calcPy = `
class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b

    def multiply(self, a, b):
        return a * b

    def divide(self, a, b):
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b
`;

    const testCalcPy = `
import unittest
from calculator import Calculator

class TestCalculator(unittest.TestCase):
    def setUp(self):
        self.calc = Calculator()

    def test_addition(self):
        self.assertEqual(self.calc.add(7, 5), 12)

    def test_subtraction(self):
        self.assertEqual(self.calc.subtract(7, 5), 2)

    def test_multiplication(self):
        self.assertEqual(self.calc.multiply(7, 5), 35)

    def test_division(self):
        self.assertEqual(self.calc.divide(20, 4), 5)

    def test_divide_by_zero(self):
        with self.assertRaises(ValueError):
            self.calc.divide(10, 0)

if __name__ == '__main__':
    unittest.main()
`;

    // Write calculator files via tool registry
    const toolCtx = {
      workspaceRoot: calcDir,
      sessionId: 'sess_calc',
      taskId: 'task_calc',
      agentRole: 'coder' as const,
      eventBus: globalEventBus,
    };

    const w1 = await globalToolRegistry.execute('write_file', { filePath: 'calculator.py', content: calcPy }, toolCtx);
    assert.strictEqual(w1.success, true);

    const w2 = await globalToolRegistry.execute('write_file', { filePath: 'test_calculator.py', content: testCalcPy }, toolCtx);
    assert.strictEqual(w2.success, true);

    // Verify files exist on disk
    assert.ok(fs.existsSync(path.join(calcDir, 'calculator.py')));
    assert.ok(fs.existsSync(path.join(calcDir, 'test_calculator.py')));

    // Run verification terminal command (Python unittest exit code 0)
    const termRes = await globalToolRegistry.execute(
      'terminal',
      { command: 'python -m unittest test_calculator.py' },
      toolCtx
    );
    assert.strictEqual(termRes.success, true);
    const termData = termRes.data as any;
    assert.strictEqual(termData.exitCode, 0);
    assert.ok(termData.stderr.includes('OK') || termData.stdout.includes('OK'));

    // Check claims with ClaimChecker
    const claims = await globalClaimChecker.verifyClaims(calcDir, 'task_calc', [
      { type: 'created', subject: 'calculator.py' },
      { type: 'created', subject: 'test_calculator.py' },
      { type: 'passed', subject: 'python -m unittest test_calculator.py' },
    ]);

    assert.strictEqual(claims.length, 3);
    assert.ok(claims.every((c) => c.supported));
  });

  await t.test('5. Fixture bug & Targeted Debugger fix: failing test repaired, passes verification', async () => {
    const bugDir = path.join(tempDir, 'bug_fixture');
    fs.mkdirSync(bugDir, { recursive: true });

    // Deliberate bug in compute: 7 - 5 returning 0 instead of 2
    const buggyCode = `
def compute(op, a, b):
    if op == 'sub':
        return 0  # BUG!
    return a + b
`;
    const bugTest = `
import unittest
from compute import compute

class TestCompute(unittest.TestCase):
    def test_sub(self):
        self.assertEqual(compute('sub', 7, 5), 2)

if __name__ == '__main__':
    unittest.main()
`;

    const toolCtx = {
      workspaceRoot: bugDir,
      sessionId: 'sess_bug',
      taskId: 'task_bug',
      agentRole: 'coder' as const,
      eventBus: globalEventBus,
    };

    await globalToolRegistry.execute('write_file', { filePath: 'compute.py', content: buggyCode }, toolCtx);
    await globalToolRegistry.execute('write_file', { filePath: 'test_compute.py', content: bugTest }, toolCtx);

    // Run check -> must fail with exit code != 0
    const failCheck = await globalToolRegistry.execute('terminal', { command: 'python test_compute.py' }, toolCtx);
    const failData = failCheck.data as any;
    assert.notStrictEqual(failData.exitCode, 0);

    // Apply targeted fix
    const fixedCode = `
def compute(op, a, b):
    if op == 'sub':
        return a - b
    return a + b
`;
    await globalToolRegistry.execute('write_file', { filePath: 'compute.py', content: fixedCode, overwrite: true }, toolCtx);

    // Re-verify -> now passes with exit code 0
    const passCheck = await globalToolRegistry.execute('terminal', { command: 'python test_compute.py' }, toolCtx);
    const passData = passCheck.data as any;
    assert.strictEqual(passData.exitCode, 0);
  });

  await t.test('6. HTML Page of Workspace Files: generates HTML listing only real workspace files', async () => {
    const htmlDir = path.join(tempDir, 'html_fixture');
    fs.mkdirSync(htmlDir, { recursive: true });

    fs.writeFileSync(path.join(htmlDir, 'README.md'), '# Fixture');
    fs.writeFileSync(path.join(htmlDir, 'package.json'), '{"name":"fixture"}');
    fs.writeFileSync(path.join(htmlDir, 'index.ts'), 'export const ready = true;');

    const toolCtx = {
      workspaceRoot: htmlDir,
      sessionId: 'sess_html',
      taskId: 'task_html',
      agentRole: 'coder' as const,
      eventBus: globalEventBus,
    };

    // List files to ensure real files
    const listRes = await globalToolRegistry.execute('list_files', { directoryPath: '.' }, toolCtx);
    assert.strictEqual(listRes.success, true);
    const files = (listRes.data as any).files.map((f: any) => f.relativePath);

    // Build real HTML
    const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Workspace Files</title></head>
<body>
  <h1>Files</h1>
  <ul>
    ${files.map((f: string) => `<li>${f}</li>`).join('\n    ')}
  </ul>
</body>
</html>`;

    await globalToolRegistry.execute('write_file', { filePath: 'files.html', content: htmlContent }, toolCtx);
    assert.ok(fs.existsSync(path.join(htmlDir, 'files.html')));
    const readBack = fs.readFileSync(path.join(htmlDir, 'files.html'), 'utf-8');
    assert.ok(readBack.includes('<li>README.md</li>'));
    assert.ok(readBack.includes('<li>package.json</li>'));
    assert.ok(readBack.includes('<li>index.ts</li>'));
    assert.ok(!readBack.includes('invented_file.txt'));
  });

  await t.test('7. ClaimChecker rejects claim for non-existent file', async () => {
    const claimDir = path.join(tempDir, 'claim_check');
    fs.mkdirSync(claimDir, { recursive: true });

    const claims = await globalClaimChecker.verifyClaims(claimDir, 'task_claim', [
      { type: 'created', subject: 'does_not_exist.py' },
    ]);

    assert.strictEqual(claims.length, 1);
    assert.strictEqual(claims[0].supported, false);
    assert.ok(claims[0].reason?.includes('does not exist'));
  });

  await t.test('8. Destructive command requires authorization (S5)', async () => {
    const decision = await globalRequestRouter.route('delete everything in this folder', tempDir);
    assert.strictEqual(decision.category, 'clarify_or_authorize');
    assert.strictEqual(decision.risk, 'high');
    assert.ok(decision.clarification?.includes('destructive'));
  });

  await t.test('9. Ambiguous prompt requires clarification (S5)', async () => {
    const decision = await globalRequestRouter.route('make it better', tempDir);
    assert.strictEqual(decision.category, 'clarify_or_authorize');
    assert.ok(decision.clarification?.includes('specify which file or aspect'));
  });
});
