import React, { useState } from 'react';
import {
  KeyRound,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Zap,
  Shield,
  Loader2,
  Cpu,
  Bot,
  Terminal,
  Code,
  Search,
  CheckCheck,
} from 'lucide-react';
import { ProviderId } from '@nexus/core';
import { ProviderStatusItem, ProviderValidationState } from '../../types/index.js';
import { api } from '../../services/api.js';

interface ProviderSetupScreenProps {
  providers: ProviderStatusItem[];
  onRefresh: () => Promise<void>;
}

export const ProviderSetupScreen: React.FC<ProviderSetupScreenProps> = ({
  providers,
  onRefresh,
}) => {
  const [keys, setKeys] = useState<{ openai: string; gemini: string }>({
    openai: '',
    gemini: '',
  });
  const [showKeys, setShowKeys] = useState<{ openai: boolean; gemini: boolean }>({
    openai: false,
    gemini: false,
  });
  const [validating, setValidating] = useState<{ openai: boolean; gemini: boolean }>({
    openai: false,
    gemini: false,
  });
  const [validationResults, setValidationResults] = useState<
    Record<ProviderId, ProviderValidationState | null>
  >({
    openai: null,
    gemini: null,
  });
  const [saving, setSaving] = useState<{ openai: boolean; gemini: boolean }>({
    openai: false,
    gemini: false,
  });
  const [saveSuccess, setSaveSuccess] = useState<Record<ProviderId, boolean>>({
    openai: false,
    gemini: false,
  });

  const handleValidate = async (provider: ProviderId) => {
    const keyToTest = keys[provider] || '';
    if (!keyToTest.trim()) {
      alert('Please enter an API key to validate.');
      return;
    }

    setValidating((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await api.validateCredentials(provider, keyToTest.trim());
      setValidationResults((prev) => ({ ...prev, [provider]: res }));
    } catch (err: any) {
      setValidationResults((prev) => ({
        ...prev,
        [provider]: {
          provider,
          isValid: false,
          message: err.message || 'Validation request failed',
        },
      }));
    } finally {
      setValidating((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleSave = async (provider: ProviderId) => {
    const keyToSave = keys[provider];
    if (!keyToSave.trim()) return;

    setSaving((prev) => ({ ...prev, [provider]: true }));
    try {
      await api.saveProviderCredentials(provider, keyToSave.trim());
      setSaveSuccess((prev) => ({ ...prev, [provider]: true }));
      setKeys((prev) => ({ ...prev, [provider]: '' }));
      await onRefresh();
      setTimeout(() => {
        setSaveSuccess((prev) => ({ ...prev, [provider]: false }));
      }, 3000);
    } catch (err: any) {
      alert(`Failed to save ${provider} key: ${err.message}`);
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const getProviderInfo = (id: ProviderId) => {
    const list = Array.isArray(providers) ? providers : [];
    return list.find((p) => p.id === id);
  };

  const subAgents = [
    {
      role: 'coordinator',
      name: 'Coordinator',
      desc: 'Deconstructs user intent, synthesizes dependency trees, and routes execution tokens across downstream specialists.',
      color: 'border-[#106EBE] text-[#F8F8F9]',
      dot: 'bg-[#106EBE]',
      status: 'ACTIVE',
    },
    {
      role: 'explorer',
      name: 'Explorer',
      desc: 'Discovers codebase architecture, indexes references, and maps workspace file hierarchies.',
      color: 'border-[#2D313A] text-[#A0A5B1]',
      dot: 'bg-[#00FFFF]',
      status: 'ACTIVE',
    },
    {
      role: 'planner',
      name: 'Planner',
      desc: 'Synthesizes structured atomic task plans with dependency ordering and target file sets.',
      color: 'border-[#2D313A] text-[#A0A5B1]',
      dot: 'bg-[#00FFFF]',
      status: 'ACTIVE',
    },
    {
      role: 'coder',
      name: 'Coder',
      desc: 'Applies surgical, targeted file modifications with precise syntax and formatting verification.',
      color: 'border-[#0FF0CB] text-[#0FF0CB]',
      dot: 'bg-[#0FF0CB]',
      status: 'ACTIVE',
    },
    {
      role: 'debugger',
      name: 'Debugger',
      desc: 'Traps runtime failures, analyzes command output diagnostics, and repairs compiler errors.',
      color: 'border-[#FFAB00] text-[#FFAB00]',
      dot: 'bg-[#FFAB00]',
      status: 'STANDBY',
    },
    {
      role: 'reviewer',
      name: 'Reviewer',
      desc: 'Inspects code diffs, verifies path boundaries and sandbox safety, and confirms task acceptance.',
      color: 'border-[#31EC56] text-[#31EC56]',
      dot: 'bg-[#31EC56]',
      status: 'ACTIVE',
    },
  ];

  return (
    <div className="h-full overflow-auto bg-[#121316] p-6 md:p-8 select-text text-[#F8F8F9]">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[#2D313A]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#A0A5B1] font-mono text-xs uppercase tracking-wider">
              <span>Runtime Orchestration</span>
              <span className="text-[#2D313A]">/</span>
              <span className="text-[#0FF0CB]">API Gateways</span>
            </div>
            <h1 className="text-2xl font-bold font-serif tracking-tight text-[#F8F8F9]">
              Agent Mesh & Gateway Configuration
            </h1>
            <p className="text-xs text-[#A0A5B1] font-serif max-w-2xl">
              Configure upstream AI provider credentials, test connection latencies, and review autonomous multi-agent delegation topology.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#16181D] border border-[#2D313A] text-[11px] font-mono text-[#A0A5B1]">
              <span className="w-2 h-2 rounded-full bg-[#0FF0CB] animate-pulse" />
              <span>Mesh Ready</span>
            </div>
          </div>
        </div>

        {/* Security Notice: Truthful Hardware & Encrypted Vault Disclosure */}
        <div className="p-3.5 rounded-lg bg-[#16181D] border border-[#2D313A] flex items-start gap-3 text-xs">
          <Shield className="w-4 h-4 text-[#0FF0CB] mt-0.5 shrink-0" />
          <div className="space-y-0.5 leading-relaxed text-[#A0A5B1]">
            <span className="font-semibold text-[#F8F8F9]">Encrypted at Rest in Machine Vault (AES-256-GCM): </span>
            Credentials are encrypted on disk using machine- and user-bound key derivation (<code className="bg-[#0D0E11] px-1 py-0.5 rounded text-[#0FF0CB] font-mono">credentials.enc</code>).
            Plaintext keys are never stored on disk, never logged, and never transmitted in API responses.
          </div>
        </div>

        {/* Provider Cards */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold font-serif text-[#F8F8F9] uppercase tracking-wider">
              Upstream AI Providers
            </h2>
            <span className="text-xs font-mono text-[#6B7280]">Loopback Authenticated Connection</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Google Gemini Card */}
            {(() => {
              const p = getProviderInfo('gemini');
              const vResult = validationResults.gemini;
              return (
                <div className="p-5 rounded-lg bg-[#16181D] border border-[#2D313A] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded bg-[#1A1D23] border border-[#2D313A] flex items-center justify-center text-[#0FF0CB] font-bold font-mono text-xs">
                        GM
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-[#F8F8F9]">Google Gemini</h3>
                        <p className="text-[11px] text-[#A0A5B1]">
                          gemini-2.5-flash, gemini-2.5-pro
                        </p>
                      </div>
                    </div>

                    <div>
                      {p?.isConfigured ? (
                        <span className="agent-chip bg-[rgba(49,236,86,0.1)] border border-[#31EC56] text-[#31EC56]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{p.maskedKey || 'Configured'}</span>
                        </span>
                      ) : (
                        <span className="agent-chip bg-[#1A1D23] border border-[#2D313A] text-[#A0A5B1]">
                          <span>Not Configured</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Input form */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-[#A0A5B1] font-mono">
                      Gemini API Key (AIzaSy...)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys.gemini ? 'text' : 'password'}
                          placeholder={p?.isConfigured ? 'Enter new key to update...' : 'AIzaSy...'}
                          value={keys.gemini}
                          onChange={(e) => setKeys((prev) => ({ ...prev, gemini: e.target.value }))}
                          className="w-full bg-[#0D0E11] border border-[#2D313A] focus:border-[#106EBE] text-[#F8F8F9] px-3 py-1.5 pr-8 rounded text-xs font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys((prev) => ({ ...prev, gemini: !prev.gemini }))}
                          className="absolute right-2 top-2 text-[#6B7280] hover:text-[#F8F8F9]"
                          tabIndex={-1}
                        >
                          {showKeys.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={!keys.gemini.trim() || validating.gemini}
                        onClick={() => handleValidate('gemini')}
                        className="px-3 py-1.5 rounded bg-[#1A1D23] hover:bg-[#22262F] border border-[#2D313A] disabled:opacity-40 text-[#F8F8F9] text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                      >
                        {validating.gemini ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-[#0FF0CB]" />}
                        <span>Test</span>
                      </button>

                      <button
                        type="button"
                        disabled={!keys.gemini.trim() || saving.gemini}
                        onClick={() => handleSave('gemini')}
                        className="px-3.5 py-1.5 rounded bg-[#106EBE] hover:bg-[#147FD6] disabled:opacity-40 text-[#F8F8F9] text-xs font-medium transition-colors shrink-0"
                      >
                        {saving.gemini ? 'Saving...' : saveSuccess.gemini ? 'Saved!' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {vResult && (
                    <div
                      className={`p-2 rounded text-xs flex items-center justify-between border ${
                        vResult.isValid
                          ? 'bg-[rgba(49,236,86,0.1)] border-[#31EC56]/60 text-[#31EC56]'
                          : 'bg-[rgba(231,71,60,0.1)] border-[#E7473C]/60 text-[#E7473C]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {vResult.isValid ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                        <span>{vResult.message}</span>
                      </div>
                      {vResult.latencyMs && (
                        <span className="font-mono text-[10px] opacity-80">{vResult.latencyMs}ms latency</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* OpenAI Card */}
            {(() => {
              const p = getProviderInfo('openai');
              const vResult = validationResults.openai;
              return (
                <div className="p-5 rounded-lg bg-[#16181D] border border-[#2D313A] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded bg-[#1A1D23] border border-[#2D313A] flex items-center justify-center text-[#106EBE] font-bold font-mono text-xs">
                        OA
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-[#F8F8F9]">OpenAI</h3>
                        <p className="text-[11px] text-[#A0A5B1]">
                          gpt-4o, gpt-4o-mini, o1, o3-mini
                        </p>
                      </div>
                    </div>

                    <div>
                      {p?.isConfigured ? (
                        <span className="agent-chip bg-[rgba(49,236,86,0.1)] border border-[#31EC56] text-[#31EC56]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{p.maskedKey || 'Configured'}</span>
                        </span>
                      ) : (
                        <span className="agent-chip bg-[#1A1D23] border border-[#2D313A] text-[#A0A5B1]">
                          <span>Not Configured</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Input form */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-[#A0A5B1] font-mono">
                      OpenAI API Key (sk-...)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys.openai ? 'text' : 'password'}
                          placeholder={p?.isConfigured ? 'Enter new key to update...' : 'sk-proj-...'}
                          value={keys.openai}
                          onChange={(e) => setKeys((prev) => ({ ...prev, openai: e.target.value }))}
                          className="w-full bg-[#0D0E11] border border-[#2D313A] focus:border-[#106EBE] text-[#F8F8F9] px-3 py-1.5 pr-8 rounded text-xs font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys((prev) => ({ ...prev, openai: !prev.openai }))}
                          className="absolute right-2 top-2 text-[#6B7280] hover:text-[#F8F8F9]"
                          tabIndex={-1}
                        >
                          {showKeys.openai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={!keys.openai.trim() || validating.openai}
                        onClick={() => handleValidate('openai')}
                        className="px-3 py-1.5 rounded bg-[#1A1D23] hover:bg-[#22262F] border border-[#2D313A] disabled:opacity-40 text-[#F8F8F9] text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                      >
                        {validating.openai ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-[#106EBE]" />}
                        <span>Test</span>
                      </button>

                      <button
                        type="button"
                        disabled={!keys.openai.trim() || saving.openai}
                        onClick={() => handleSave('openai')}
                        className="px-3.5 py-1.5 rounded bg-[#106EBE] hover:bg-[#147FD6] disabled:opacity-40 text-[#F8F8F9] text-xs font-medium transition-colors shrink-0"
                      >
                        {saving.openai ? 'Saving...' : saveSuccess.openai ? 'Saved!' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {vResult && (
                    <div
                      className={`p-2 rounded text-xs flex items-center justify-between border ${
                        vResult.isValid
                          ? 'bg-[rgba(49,236,86,0.1)] border-[#31EC56]/60 text-[#31EC56]'
                          : 'bg-[rgba(231,71,60,0.1)] border-[#E7473C]/60 text-[#E7473C]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {vResult.isValid ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                        <span>{vResult.message}</span>
                      </div>
                      {vResult.latencyMs && (
                        <span className="font-mono text-[10px] opacity-80">{vResult.latencyMs}ms latency</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Autonomous Sub-Agents Grid (Matching Stitch V2 multi_agent_configuration) */}
        <section className="space-y-4 pt-2">
          <div className="flex items-baseline justify-between border-b border-[#2D313A] pb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold font-serif text-[#F8F8F9] uppercase tracking-wider">
                Autonomous Sub-Agents
              </h2>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#1A1D23] text-[#0FF0CB] border border-[#2D313A]">
                06 NODES
              </span>
            </div>
            <span className="text-xs font-serif text-[#A0A5B1]">Cascades execution across specialized agent roles</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subAgents.map((agent) => (
              <div
                key={agent.role}
                className="p-4 rounded-lg bg-[#16181D] border border-[#2D313A] flex flex-col justify-between space-y-3 hover:border-[#383D48] transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${agent.dot}`} />
                      <h3 className="font-semibold text-sm font-serif text-[#F8F8F9] capitalize">
                        {agent.name}
                      </h3>
                    </div>
                    <span className="agent-chip bg-[#1A1D23] border border-[#2D313A] text-[#A0A5B1]">
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#A0A5B1] font-serif leading-relaxed">
                    {agent.desc}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#2D313A]/60 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[#6B7280]">Role:</span>
                  <span className="text-[#F8F8F9] font-medium">{agent.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
