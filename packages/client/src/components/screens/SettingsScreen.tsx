import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  ShieldCheck,
  Cpu,
  FolderGit2,
  Terminal,
  Save,
  Check,
} from 'lucide-react';
import { AgentRole } from '@nexus/core';
import { WorkspaceInfo } from '@nexus/core';

interface SettingsScreenProps {
  activeWorkspace: WorkspaceInfo | null;
  onUpdateWorkspaceRoot?: (path: string) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  activeWorkspace,
  onUpdateWorkspaceRoot,
}) => {
  const [workspaceInput, setWorkspaceInput] = useState(activeWorkspace?.path || '');
  const [terminalTimeout, setTerminalTimeout] = useState('30000');
  const [maxOutputBytes, setMaxOutputBytes] = useState('524288'); // 512KB
  const [saved, setSaved] = useState(false);

  const [roleModels, setRoleModels] = useState<Record<AgentRole, string>>({
    coordinator: 'gemini-2.5-pro',
    explorer: 'gemini-2.5-flash',
    planner: 'gemini-2.5-pro',
    coder: 'gemini-2.5-flash',
    debugger: 'gemini-2.5-pro',
    reviewer: 'gemini-2.5-flash',
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (workspaceInput.trim() && onUpdateWorkspaceRoot) {
      onUpdateWorkspaceRoot(workspaceInput.trim());
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="h-full overflow-auto bg-[#070a12] p-8 select-text text-slate-200">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-sky-400 font-mono text-xs uppercase tracking-wider">
            <SettingsIcon className="w-4 h-4" />
            <span>Workspace & System Settings</span>
          </div>
          <h1 className="text-2xl font-bold text-white font-mono">Configuration & Safety Boundaries</h1>
          <p className="text-xs text-slate-400">
            Customize agent model routing, terminal execution bounds, and safety parameters.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Workspace Root Section */}
          <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200 font-mono">
              <FolderGit2 className="w-4 h-4 text-sky-400" />
              <span>Target Workspace Root</span>
            </div>

            <div className="space-y-1.5">
              <input
                type="text"
                value={workspaceInput}
                onChange={(e) => setWorkspaceInput(e.target.value)}
                placeholder="C:\Users\...\Desktop\project"
                className="w-full bg-nexus-950 border border-nexus-border focus:border-sky-500 text-slate-200 px-3 py-2 rounded text-xs font-mono focus:outline-none"
              />
              <p className="text-[11px] text-slate-500">
                All file modifications, relative path resolution, and terminal executions are strictly sandboxed inside this boundary.
              </p>
            </div>
          </div>

          {/* Model Routing by Agent Role */}
          <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200 font-mono">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Specialist Agent Model Routing</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
              {(
                [
                  'coordinator',
                  'explorer',
                  'planner',
                  'coder',
                  'debugger',
                  'reviewer',
                ] as AgentRole[]
              ).map((role) => (
                <div key={role} className="p-2.5 rounded bg-nexus-950/60 border border-nexus-border/60 space-y-1">
                  <div className="flex items-center justify-between text-slate-300 capitalize text-xs">
                    <span>{role} Agent</span>
                    <span className="text-[10px] text-slate-500">
                      {role === 'coordinator' || role === 'planner' || role === 'debugger'
                        ? 'High Reasoning'
                        : 'Fast Execution'}
                    </span>
                  </div>
                  <select
                    value={roleModels[role]}
                    onChange={(e) =>
                      setRoleModels((prev) => ({ ...prev, [role]: e.target.value }))
                    }
                    className="w-full bg-nexus-900 border border-nexus-border text-slate-200 px-2 py-1 rounded text-xs focus:outline-none"
                  >
                    <option value="gemini-2.5-pro">Google Gemini 2.5 Pro</option>
                    <option value="gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-thinking">Gemini 2.5 Flash Thinking</option>
                    <option value="gpt-4o">OpenAI GPT-4o</option>
                    <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                    <option value="o1">OpenAI o1</option>
                    <option value="o3-mini">OpenAI o3-mini</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Bounds & Safety Safeguards */}
          <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Process Limits & Safeguards</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-300">Terminal Command Timeout (ms)</label>
                <input
                  type="number"
                  value={terminalTimeout}
                  onChange={(e) => setTerminalTimeout(e.target.value)}
                  className="w-full bg-nexus-950 border border-nexus-border text-slate-200 px-3 py-1.5 rounded focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">Process tree auto-killed if exceeded.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300">Max Terminal Output (bytes)</label>
                <input
                  type="number"
                  value={maxOutputBytes}
                  onChange={(e) => setMaxOutputBytes(e.target.value)}
                  className="w-full bg-nexus-950 border border-nexus-border text-slate-200 px-3 py-1.5 rounded focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">Output truncated to prevent buffer memory blowups.</p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end space-x-3">
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-colors shadow-lg shadow-sky-600/20"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Settings Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
