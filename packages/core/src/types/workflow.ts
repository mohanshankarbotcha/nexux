import { ClaimItem, ClaimVerificationResult } from './tool.js';

export interface ExplorerReport {
  relevantFiles: string[];
  symbols: string[];
  conventions: string[];
  buildCommands: string[];
  testCommands: string[];
  risks: string[];
}

export interface AcceptanceCheck {
  id: string;
  command: string;
  description: string;
  expectedExitCode?: number;
}

export interface Milestone {
  id: string;
  title: string;
  targetFiles: string[];
  risks: string[];
  acceptanceChecks: AcceptanceCheck[];
}

export interface Plan {
  requirements: string[];
  assumptions: string[];
  stackChoice: string;
  milestones: Milestone[];
}

export interface ChangeSet {
  createdFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  totalFilesChanged: number;
}

export interface VerificationCheckResult {
  checkId: string;
  command: string;
  exitCode: number | null;
  outputSummary: string;
  passed: boolean;
  durationMs: number;
}

export interface VerificationReport {
  allPassed: boolean;
  checks: VerificationCheckResult[];
  failedCount: number;
  passedCount: number;
  diagnostics?: string[];
}

export interface FixAttempt {
  iteration: number;
  failingCommand: string;
  hypothesis: string;
  editsMade: string[];
}

export interface ReviewIssue {
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  filePath?: string;
  suggestedFix?: string;
}

export interface ReviewReport {
  approved: boolean;
  blockerCount: number;
  warningCount: number;
  issues: ReviewIssue[];
}

export interface FinalReport {
  taskId: string;
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
  changeSet: ChangeSet;
  verificationReport: VerificationReport;
  claims: ClaimVerificationResult[];
  howToRun?: string[];
  assumptions?: string[];
  blockerReason?: string;
}
