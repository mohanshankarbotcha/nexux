import { execSync } from 'node:child_process';
import fs from 'node:fs';

const summary = JSON.parse(fs.readFileSync('docs/nexus-v2/evidence/13-acceptance/summary.json', 'utf8'));
const wsPath = summary.scenarios.A2.workspacePath;

console.log('Testing calculator from:', wsPath);

const pyScript = `
import sys
sys.path.append(r"${wsPath}")
import calculator as c

print(f"ADD: 7 + 5 = {c.add(7, 5)}")
print(f"SUB: 7 - 5 = {c.subtract(7, 5)}")
print(f"MUL: 7 * 5 = {c.multiply(7, 5)}")
print(f"DIV: 20 / 4 = {c.divide(20, 4)}")
print(f"DIV0: 5 / 0 = {c.divide(5, 0)}")
`;

fs.writeFileSync('scripts/py-test.py', pyScript, 'utf8');
const output = execSync('python scripts/py-test.py', { encoding: 'utf8' });
console.log('\n--- Independent Calculator Arithmetic Output ---');
console.log(output);
fs.unlinkSync('scripts/py-test.py');
