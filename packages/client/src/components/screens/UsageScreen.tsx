import React, { useState } from 'react';
import {
  BarChart3,
  Coins,
  Cpu,
  Bot,
  Layers,
  Clock,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { UsageRecord, UsageSummary } from '@nexus/core';

interface UsageScreenProps {
  summary: UsageSummary | null;
  records: UsageRecord[];
  onRefresh?: () => Promise<void>;
}

export const UsageScreen: React.FC<UsageScreenProps> = ({
  summary,
  records,
  onRefresh,
}) => {
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRecords = records.filter((r) => {
    if (filterAgent !== 'all' && r.agent !== filterAgent) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        r.model.toLowerCase().includes(term) ||
        r.provider.toLowerCase().includes(term) ||
        r.taskId?.toLowerCase().includes(term) ||
        r.agent.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="h-full overflow-auto bg-[#070a12] p-8 select-text text-slate-200">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-amber-400 font-mono text-xs uppercase tracking-wider">
              <Coins className="w-4 h-4" />
              <span>Token Economics & Observability</span>
            </div>
            <h1 className="text-2xl font-bold text-white font-mono">Usage & Cost Intelligence</h1>
            <p className="text-xs text-slate-400">
              Accurate token telemetry and centralized cost estimation calculated per model pricing.
            </p>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 rounded bg-nexus-850 hover:bg-nexus-800 border border-nexus-border text-xs font-mono text-slate-300 transition-colors"
            >
              Refresh Telemetry
            </button>
          )}
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="text-[11px] text-slate-400 font-mono">Total Requests</div>
            <div className="text-xl font-bold text-white font-mono">
              {(summary?.totalRequests || 0).toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="text-[11px] text-slate-400 font-mono">Input Tokens</div>
            <div className="text-xl font-bold text-sky-400 font-mono">
              {(summary?.totalInputTokens || 0).toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="text-[11px] text-slate-400 font-mono">Output Tokens</div>
            <div className="text-xl font-bold text-indigo-400 font-mono">
              {(summary?.totalOutputTokens || 0).toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1">
            <div className="text-[11px] text-slate-400 font-mono">Total Tokens</div>
            <div className="text-xl font-bold text-amber-400 font-mono">
              {(summary?.totalTokens || 0).toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-1 col-span-2 md:col-span-1">
            <div className="text-[11px] text-slate-400 font-mono">Estimated Cost (USD)</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              ${(summary?.totalEstimatedCostUsd || 0).toFixed(4)}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Estimated via pricing table</div>
          </div>
        </div>

        {/* Aggregations: By Provider, By Model, By Agent */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* By Provider */}
          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 font-mono uppercase">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>By Provider</span>
            </div>

            <div className="space-y-2">
              {summary && Object.keys(summary.byProvider).length > 0 ? (
                Object.entries(summary.byProvider).map(([provider, data]) => (
                  <div
                    key={provider}
                    className="p-2 rounded bg-nexus-950/60 border border-nexus-border/60 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="capitalize">{provider}</span>
                      <span className="text-emerald-400">${data.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{data.requests} calls ({data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out)</span>
                      <span>{data.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic">No provider calls recorded yet.</div>
              )}
            </div>
          </div>

          {/* By Model */}
          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 font-mono uppercase">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>By Model</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-auto">
              {summary && Object.keys(summary.byModel).length > 0 ? (
                Object.entries(summary.byModel).map(([model, data]) => (
                  <div
                    key={model}
                    className="p-2 rounded bg-nexus-950/60 border border-nexus-border/60 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="truncate max-w-[140px]">{model}</span>
                      <span className="text-emerald-400">${data.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{data.requests} calls ({data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out)</span>
                      <span>{data.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic">No model calls recorded yet.</div>
              )}
            </div>
          </div>

          {/* By Agent Role */}
          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 font-mono uppercase">
              <Bot className="w-3.5 h-3.5 text-amber-400" />
              <span>By Agent Role</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-auto">
              {summary && Object.keys(summary.byAgent).length > 0 ? (
                Object.entries(summary.byAgent).map(([agent, data]) => (
                  <div
                    key={agent}
                    className="p-2 rounded bg-nexus-950/60 border border-nexus-border/60 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="capitalize">{agent}</span>
                      <span className="text-emerald-400">${data.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{data.requests} calls ({data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out)</span>
                      <span>{data.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic">No agent calls recorded yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Aggregations: By Task & By Session */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* By Task */}
          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 font-mono uppercase">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>By Coding Task</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-auto">
              {summary && summary.byTask && Object.keys(summary.byTask).length > 0 ? (
                Object.entries(summary.byTask).map(([task, data]) => (
                  <div
                    key={task}
                    className="p-2 rounded bg-nexus-950/60 border border-nexus-border/60 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="truncate max-w-[200px]">{task}</span>
                      <span className="text-emerald-400">${data.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{data.requests} requests ({data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out)</span>
                      <span>{data.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic">No task telemetry recorded yet.</div>
              )}
            </div>
          </div>

          {/* By Session */}
          <div className="p-4 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 font-mono uppercase">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>By Session</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-auto">
              {summary && summary.bySession && Object.keys(summary.bySession).length > 0 ? (
                Object.entries(summary.bySession).map(([sess, data]) => (
                  <div
                    key={sess}
                    className="p-2 rounded bg-nexus-950/60 border border-nexus-border/60 text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="truncate max-w-[200px]">{sess}</span>
                      <span className="text-emerald-400">${data.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{data.requests} requests ({data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out)</span>
                      <span>{data.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic">No session telemetry recorded yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Requests Table */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Recent Model Telemetry Requests ({filteredRecords.length})
            </h2>

            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter requests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-nexus-950 border border-nexus-border focus:border-sky-500 text-slate-200 pl-8 pr-3 py-1 rounded text-xs font-mono focus:outline-none"
                />
              </div>

              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="bg-nexus-950 border border-nexus-border text-slate-300 px-2 py-1 rounded text-xs font-mono focus:outline-none"
              >
                <option value="all">All Agents</option>
                <option value="coordinator">Coordinator</option>
                <option value="explorer">Explorer</option>
                <option value="planner">Planner</option>
                <option value="coder">Coder</option>
                <option value="debugger">Debugger</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-nexus-border bg-nexus-900/40">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-nexus-900/80 border-b border-nexus-border text-slate-400 select-none">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Agent</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3 text-right">In / Out</th>
                  <th className="py-2.5 px-3 text-right">Total Tokens</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Cost (Est.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nexus-border/60">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                      No matching telemetry records found.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => (
                    <tr key={r.requestId || idx} className="hover:bg-nexus-850/40 transition-colors">
                      <td className="py-2 px-3 text-slate-400">
                        {new Date(r.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-nexus-800 text-sky-300 uppercase text-[10px]">
                          {r.agent}
                        </span>
                      </td>
                      <td className="py-2 px-3 capitalize text-slate-300">{r.provider}</td>
                      <td className="py-2 px-3 text-slate-300 truncate max-w-[140px]">{r.model}</td>
                      <td className="py-2 px-3 text-right text-slate-400">
                        {r.inputTokens} / {r.outputTokens}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-amber-300">
                        {r.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">{r.durationMs}ms</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-400">
                        ${r.estimatedCostUsd.toFixed(5)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
