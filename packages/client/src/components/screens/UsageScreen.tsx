import React, { useState } from 'react';
import {
  Coins,
  Cpu,
  Layers,
  Clock,
  RotateCw,
  Search,
  Filter,
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const totalTokens = summary?.totalTokens ?? 0;
  const totalCost = summary?.totalEstimatedCostUsd ?? 0;
  const totalRequests = summary?.totalRequests ?? records.length;
  const byModel = summary?.byModel ?? {};

  return (
    <div className="h-full overflow-auto bg-[#121316] p-6 md:p-8 select-text text-[#F8F8F9]">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[#2D313A]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#A0A5B1] font-mono text-xs uppercase tracking-wider">
              <span>Telemetry & Economics</span>
              <span className="text-[#2D313A]">/</span>
              <span className="text-[#0FF0CB]">Real Ledger</span>
            </div>
            <h1 className="text-2xl font-bold font-serif tracking-tight text-[#F8F8F9]">
              Project Telemetry & Token Accounting
            </h1>
            <p className="text-xs text-[#A0A5B1] font-serif max-w-2xl">
              Strict usage accounting and pricing telemetry aggregated across autonomous agent executions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded bg-[#16181D] hover:bg-[#1A1D23] border border-[#2D313A] text-xs font-mono text-[#F8F8F9] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 text-[#0FF0CB] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sync Ledger</span>
            </button>
          </div>
        </div>

        {/* Global Key Usage Metrics KPI Cards */}
        <section aria-label="Key Usage Metrics">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Card 1: Total Tokens */}
            <div className="p-4 rounded-lg bg-[#16181D] border border-[#2D313A] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif text-[#A0A5B1]">Total Consumed Tokens</span>
                <Coins className="w-4 h-4 text-[#FFAB00]" />
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold text-[#F8F8F9] tracking-tight">
                  {totalTokens.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                  Input: {(summary?.totalInputTokens ?? 0).toLocaleString()} · Output: {(summary?.totalOutputTokens ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Card 2: Estimated Cost */}
            <div className="p-4 rounded-lg bg-[#16181D] border border-[#2D313A] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif text-[#A0A5B1]">Estimated Total Cost</span>
                <span className="text-xs font-mono text-[#0FF0CB]">USD</span>
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold text-[#0FF0CB] tracking-tight">
                  ${totalCost.toFixed(4)}
                </div>
                <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                  Official provider pricing schedule
                </div>
              </div>
            </div>

            {/* Card 3: Model Requests */}
            <div className="p-4 rounded-lg bg-[#16181D] border border-[#2D313A] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif text-[#A0A5B1]">Total AI Invocations</span>
                <Cpu className="w-4 h-4 text-[#106EBE]" />
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold text-[#F8F8F9] tracking-tight">
                  {totalRequests.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                  LLM prompt turns completed
                </div>
              </div>
            </div>

            {/* Card 4: Models Active */}
            <div className="p-4 rounded-lg bg-[#16181D] border border-[#2D313A] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif text-[#A0A5B1]">Models Engaged</span>
                <Layers className="w-4 h-4 text-[#31EC56]" />
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold text-[#F8F8F9] tracking-tight">
                  {Object.keys(byModel).length}
                </div>
                <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                  Distinct models in ledger
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Model Breakdown Grid */}
        {Object.keys(byModel).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold font-serif text-[#F8F8F9] uppercase tracking-wider">
              Token Consumption by Model
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(byModel).map(([modelName, stats]) => (
                <div key={modelName} className="p-3.5 rounded-lg bg-[#16181D] border border-[#2D313A] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#F8F8F9]">{modelName}</span>
                    <span className="font-mono text-[10px] text-[#0FF0CB]">${stats.estimatedCostUsd?.toFixed(4) || '0.0000'}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#A0A5B1]">
                    {stats.tokens?.toLocaleString()} tokens ({stats.requests} calls)
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Usage Records Ledger Table */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold font-serif text-[#F8F8F9] uppercase tracking-wider">
                Execution Usage Ledger
              </h2>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#1A1D23] text-[#A0A5B1] border border-[#2D313A]">
                {filteredRecords.length} records
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#6B7280]" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#0D0E11] border border-[#2D313A] rounded text-xs font-mono pl-8 pr-3 py-1 text-[#F8F8F9] focus:outline-none focus:border-[#106EBE] w-48"
                />
              </div>

              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="bg-[#0D0E11] border border-[#2D313A] rounded text-xs font-mono px-2 py-1 text-[#F8F8F9] focus:outline-none focus:border-[#106EBE]"
              >
                <option value="all">All Roles</option>
                <option value="coordinator">Coordinator</option>
                <option value="explorer">Explorer</option>
                <option value="planner">Planner</option>
                <option value="coder">Coder</option>
                <option value="debugger">Debugger</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="p-8 rounded-lg bg-[#16181D] border border-[#2D313A] text-center space-y-2">
              <Clock className="w-6 h-6 text-[#6B7280] mx-auto" />
              <div className="text-xs font-serif text-[#A0A5B1]">No usage records found in ledger</div>
              <div className="text-[11px] text-[#6B7280] font-serif">
                Run an autonomous coding task in Chat or Workspace to populate telemetry.
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-[#16181D] border border-[#2D313A] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#1A1D23] border-b border-[#2D313A] text-[#A0A5B1] text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Task ID</th>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3 text-right">Input</th>
                      <th className="py-2.5 px-3 text-right">Output</th>
                      <th className="py-2.5 px-3 text-right">Cost ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2D313A]/50">
                    {filteredRecords.slice(0, 50).map((r, i) => (
                      <tr key={i} className="hover:bg-[#1A1D23]/60 transition-colors">
                        <td className="py-2 px-3 text-[#6B7280] whitespace-nowrap text-[11px]">
                          {new Date(r.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 text-[#A0A5B1] truncate max-w-[120px] text-[11px]">
                          {r.taskId || 'standalone'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="agent-chip bg-[#1A1D23] border border-[#2D313A] text-[#A0A5B1]">
                            {r.agent}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#F8F8F9] text-[11px]">
                          {r.model}
                        </td>
                        <td className="py-2 px-3 text-right text-[#A0A5B1] text-[11px]">
                          {r.inputTokens.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-[#A0A5B1] text-[11px]">
                          {r.outputTokens.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right text-[#0FF0CB] font-semibold text-[11px]">
                          ${r.estimatedCostUsd?.toFixed(4) || '0.0000'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
