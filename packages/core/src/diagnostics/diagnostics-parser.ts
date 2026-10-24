import { DiagnosticItem, ParsedDiagnostics } from '../types/tool.js';

export function parseCompilerAndRuntimeDiagnostics(rawOutput: string): ParsedDiagnostics {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return { diagnostics: [], errorCount: 0, warningCount: 0 };
  }

  const lines = rawOutput.split(/\r?\n/);
  const diagnostics: DiagnosticItem[] = [];

  // Regex patterns
  // 1. TypeScript style: src/file.ts(10,5): error TS2322: message OR src/file.ts:10:5 - error TS2322: message
  const tsPattern1 = /^([a-zA-Z0-9_\-./\\]+)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Z0-9]+):\s*(.*)$/i;
  const tsPattern2 = /^([a-zA-Z0-9_\-./\\]+):(\d+):(\d+)\s*-\s*(error|warning)\s+([A-Z0-9]+):\s*(.*)$/i;

  // 2. ESLint single line: /path/file.js:10:5: message [rule-name]
  const eslintPattern = /^([a-zA-Z0-9_\-./\\]+):(\d+):(\d+):\s*(.*)\s+\[([a-zA-Z0-9\-_/]+)\]$/i;

  // 3. Python traceback: File "calc.py", line 12, in <module>
  const pyPattern = /^\s*File\s+["']([^"']+)["'],\s+line\s+(\d+)(?:,\s+in\s+(.*))?/i;

  // 4. Node stack trace: at functionName (path/to/file.js:15:9) or at path/to/file.js:15:9
  const nodeStackPattern = /^\s*at\s+(?:.*?\s+\((.*?):(\d+):(\d+)\)|(.*?):(\d+):(\d+))$/;

  // 5. npm ERR! code ...
  const npmErrPattern = /^npm\s+ERR!\s+(?:code\s+([A-Z0-9_]+)|(.*))$/i;

  // 6. Jest / Vitest test failure
  const jestFailHeader = /^\s*(?:FAIL|✕)\s+([a-zA-Z0-9_\-./\\]+)/i;

  let currentPythonFile = '';
  let currentPythonLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // TypeScript Pattern 1
    const tsMatch1 = line.match(tsPattern1);
    if (tsMatch1) {
      const [, file, lineStr, colStr, severity, code, message] = tsMatch1;
      diagnostics.push({
        file,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity.toLowerCase() === 'warning' ? 'warning' : 'error',
        code,
        message: message.trim(),
        source: 'typescript',
      });
      continue;
    }

    // TypeScript Pattern 2
    const tsMatch2 = line.match(tsPattern2);
    if (tsMatch2) {
      const [, file, lineStr, colStr, severity, code, message] = tsMatch2;
      diagnostics.push({
        file,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity.toLowerCase() === 'warning' ? 'warning' : 'error',
        code,
        message: message.trim(),
        source: 'typescript',
      });
      continue;
    }

    // ESLint Pattern
    const eslintMatch = line.match(eslintPattern);
    if (eslintMatch) {
      const [, file, lineStr, colStr, message, code] = eslintMatch;
      diagnostics.push({
        file,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: 'error',
        code,
        message: message.trim(),
        source: 'eslint',
      });
      continue;
    }

    // Python Traceback line tracking
    const pyMatch = line.match(pyPattern);
    if (pyMatch) {
      currentPythonFile = pyMatch[1];
      currentPythonLine = parseInt(pyMatch[2], 10);
      continue;
    }
    if (currentPythonFile && /^[a-zA-Z0-9_]+Error:\s*(.*)/.test(line)) {
      diagnostics.push({
        file: currentPythonFile,
        line: currentPythonLine,
        severity: 'error',
        message: line,
        source: 'python',
      });
      currentPythonFile = '';
      currentPythonLine = 0;
      continue;
    }

    // Jest test failure header
    const jestMatch = line.match(jestFailHeader);
    if (jestMatch) {
      diagnostics.push({
        file: jestMatch[1],
        severity: 'error',
        message: line,
        source: 'jest',
      });
      continue;
    }

    // Node Stack Trace
    const nodeMatch = line.match(nodeStackPattern);
    if (nodeMatch) {
      const file = nodeMatch[1] || nodeMatch[4];
      const lineStr = nodeMatch[2] || nodeMatch[5];
      const colStr = nodeMatch[3] || nodeMatch[6];
      if (file && !file.includes('node:internal')) {
        diagnostics.push({
          file,
          line: lineStr ? parseInt(lineStr, 10) : undefined,
          column: colStr ? parseInt(colStr, 10) : undefined,
          severity: 'error',
          message: line,
          source: 'node',
        });
      }
      continue;
    }

    // npm Error pattern
    const npmMatch = line.match(npmErrPattern);
    if (npmMatch) {
      diagnostics.push({
        file: 'package.json',
        severity: 'error',
        code: npmMatch[1] || 'npm_error',
        message: npmMatch[2] || line,
        source: 'npm',
      });
      continue;
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const rawTail = lines.slice(-20).join('\n');

  return {
    diagnostics,
    errorCount,
    warningCount,
    rawTail,
  };
}
