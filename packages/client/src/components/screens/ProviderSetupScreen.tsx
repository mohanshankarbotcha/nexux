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
  AlertTriangle,
  RefreshCw,
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
    return providers.find((p) => p.id === id);
  };

  return (
    <div className="h-full overflow-auto bg-[#070a12] p-8 select-text text-slate-200">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-sky-400 font-mono text-xs uppercase tracking-wider">
            <KeyRound className="w-4 h-4" />
            <span>Model Provider Configuration</span>
          </div>
          <h1 className="text-2xl font-bold text-white font-mono">API Keys & Model Credentials</h1>
          <p className="text-xs text-slate-400">
            NEXUS.AI requires at least one valid AI provider configured to route coding, planning, and debugging tasks.
          </p>
        </div>

        {/* Security Notice */}
        <div className="p-3.5 rounded-lg bg-sky-950/30 border border-sky-800/40 flex items-start space-x-3 text-xs">
          <Shield className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
          <div className="space-y-0.5 leading-relaxed text-slate-300">
            <span className="font-semibold text-sky-200">Zero-Leak Local Storage Guarantee: </span>
            Credentials are securely encrypted/isolated inside your local application directory
            (<code className="bg-nexus-900 px-1 py-0.5 rounded text-sky-300 font-mono">%LOCALAPPDATA%\NEXUS_AI_DATA\credentials.json</code>).
            Keys are never logged, telemetry-tracked, or shared.
          </div>
        </div>

        {/* Provider Cards */}
        <div className="space-y-6">
          {/* OpenAI Provider Card */}
          {(() => {
            const p = getProviderInfo('openai');
            const vResult = validationResults.openai;
            return (
              <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 font-bold font-mono">
                      OA
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-slate-100">OpenAI</h3>
                      <p className="text-xs text-slate-400">
                        GPT-4o, GPT-4o-mini, o1, o3-mini models
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {p?.isConfigured ? (
                      <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800/60 text-emerald-400 text-xs font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Configured ({p.maskedKey})</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-nexus-850 border border-nexus-border text-slate-400 text-xs font-mono">
                        <span>Not Configured</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Input form */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-mono">
                    OpenAI API Key (sk-...)
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys.openai ? 'text' : 'password'}
                        placeholder={p?.isConfigured ? 'Enter new key to update...' : 'sk-proj-...'}
                        value={keys.openai}
                        onChange={(e) => setKeys((prev) => ({ ...prev, openai: e.target.value }))}
                        className="w-full bg-nexus-950 border border-nexus-border focus:border-sky-500 text-slate-200 px-3 py-2 pr-9 rounded text-xs font-mono focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys((prev) => ({ ...prev, openai: !prev.openai }))}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                      >
                        {showKeys.openai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!keys.openai.trim() || validating.openai}
                      onClick={() => handleValidate('openai')}
                      className="px-3 py-2 rounded bg-nexus-800 hover:bg-nexus-700 disabled:opacity-40 text-slate-200 text-xs font-medium transition-colors flex items-center space-x-1 shrink-0"
                    >
                      {validating.openai ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      <span>Test & Ping</span>
                    </button>

                    <button
                      type="button"
                      disabled={!keys.openai.trim() || saving.openai}
                      onClick={() => handleSave('openai')}
                      className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0"
                    >
                      {saving.openai ? 'Saving...' : saveSuccess.openai ? 'Saved!' : 'Save Key'}
                    </button>
                  </div>
                </div>

                {/* Validation Response Result */}
                {vResult && (
                  <div
                    className={`p-2.5 rounded text-xs flex items-center justify-between border ${
                      vResult.isValid
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {vResult.isValid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                      <span>{vResult.message}</span>
                    </div>
                    {vResult.latencyMs && (
                      <span className="font-mono text-[11px] opacity-80">{vResult.latencyMs}ms latency</span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Google Gemini Provider Card */}
          {(() => {
            const p = getProviderInfo('gemini');
            const vResult = validationResults.gemini;
            return (
              <div className="p-5 rounded-xl bg-nexus-900/60 border border-nexus-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/40 flex items-center justify-center text-sky-400 font-bold font-mono">
                      GM
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-slate-100">Google Gemini</h3>
                      <p className="text-xs text-slate-400">
                        Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.5 Flash Thinking
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {p?.isConfigured ? (
                      <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800/60 text-emerald-400 text-xs font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Configured ({p.maskedKey})</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-nexus-850 border border-nexus-border text-slate-400 text-xs font-mono">
                        <span>Not Configured</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Input form */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-mono">
                    Google Gemini API Key (AIzaSy...)
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys.gemini ? 'text' : 'password'}
                        placeholder={p?.isConfigured ? 'Enter new key to update...' : 'AIzaSy...'}
                        value={keys.gemini}
                        onChange={(e) => setKeys((prev) => ({ ...prev, gemini: e.target.value }))}
                        className="w-full bg-nexus-950 border border-nexus-border focus:border-sky-500 text-slate-200 px-3 py-2 pr-9 rounded text-xs font-mono focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeys((prev) => ({ ...prev, gemini: !prev.gemini }))}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                      >
                        {showKeys.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!keys.gemini.trim() || validating.gemini}
                      onClick={() => handleValidate('gemini')}
                      className="px-3 py-2 rounded bg-nexus-800 hover:bg-nexus-700 disabled:opacity-40 text-slate-200 text-xs font-medium transition-colors flex items-center space-x-1 shrink-0"
                    >
                      {validating.gemini ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      <span>Test & Ping</span>
                    </button>

                    <button
                      type="button"
                      disabled={!keys.gemini.trim() || saving.gemini}
                      onClick={() => handleSave('gemini')}
                      className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0"
                    >
                      {saving.gemini ? 'Saving...' : saveSuccess.gemini ? 'Saved!' : 'Save Key'}
                    </button>
                  </div>
                </div>

                {/* Validation Response Result */}
                {vResult && (
                  <div
                    className={`p-2.5 rounded text-xs flex items-center justify-between border ${
                      vResult.isValid
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {vResult.isValid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                      <span>{vResult.message}</span>
                    </div>
                    {vResult.latencyMs && (
                      <span className="font-mono text-[11px] opacity-80">{vResult.latencyMs}ms latency</span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
