import React from 'react';
import {
  ListTodo,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  FileCode2,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import { PlanData } from '../../types/index.js';

interface PlanViewProps {
  plan: PlanData | null;
  currentStepId?: string;
}

export const PlanView: React.FC<PlanViewProps> = ({ plan, currentStepId }) => {
  if (!plan) {
    return (
      <div className="p-4 text-xs text-slate-500 italic select-none">
        No active plan. When you run an agent task, the Planner Agent will formulate an execution plan here.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 font-mono text-xs select-text">
      {/* Plan Summary */}
      <div className="p-2.5 rounded bg-nexus-900 border border-nexus-border/80">
        <div className="flex items-center space-x-1.5 text-sky-400 font-semibold mb-1">
          <ListTodo className="w-3.5 h-3.5" />
          <span>Execution Strategy</span>
        </div>
        <p className="text-slate-300 font-sans text-xs leading-relaxed">{plan.summary}</p>
      </div>

      {/* Risks if any */}
      {plan.risks && plan.risks.length > 0 && (
        <div className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40 space-y-1">
          <div className="flex items-center space-x-1.5 text-amber-400 font-semibold text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            <span>Identified Risks & Edge Cases</span>
          </div>
          <ul className="list-disc list-inside text-amber-200/80 font-sans text-[11px] space-y-0.5">
            {plan.risks.map((risk, idx) => (
              <li key={idx}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps List */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none">
          Action Steps ({plan.steps.length})
        </div>

        {plan.steps.map((step, idx) => {
          const isCurrent = step.id === currentStepId;
          const isDone = step.status === 'completed';
          const isFailed = step.status === 'failed';
          const isRunning = step.status === 'running' || isCurrent;

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded border transition-colors ${
                isRunning
                  ? 'border-sky-500/60 bg-sky-950/30'
                  : isDone
                  ? 'border-emerald-900/50 bg-emerald-950/10'
                  : isFailed
                  ? 'border-rose-900/50 bg-rose-950/20'
                  : 'border-nexus-border bg-nexus-900/40'
              }`}
            >
              <div className="flex items-start space-x-2">
                <div className="mt-0.5 shrink-0">
                  {isRunning ? (
                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : isFailed ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-600" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 text-xs">
                      Step {idx + 1}: {step.id}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-sans uppercase ${
                        isDone
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : isRunning
                          ? 'bg-sky-900/40 text-sky-300'
                          : isFailed
                          ? 'bg-rose-900/40 text-rose-300'
                          : 'bg-nexus-800 text-slate-400'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>

                  <p className="text-slate-300 font-sans text-xs">{step.description}</p>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {step.targetFiles &&
                      step.targetFiles.map((file) => (
                        <span
                          key={file}
                          className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-nexus-850 border border-nexus-border text-[10px] text-slate-400"
                        >
                          <FileCode2 className="w-2.5 h-2.5 text-sky-400" />
                          <span>{file}</span>
                        </span>
                      ))}

                    {step.verificationCommand && (
                      <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-nexus-850 border border-nexus-border text-[10px] text-emerald-400">
                        <Terminal className="w-2.5 h-2.5" />
                        <span>{step.verificationCommand}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
