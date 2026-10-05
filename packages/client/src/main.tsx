import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('NEXUS.AI Client Root Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#070a12] text-slate-200 p-8 font-mono select-text">
          <div className="max-w-lg w-full bg-nexus-900 border border-rose-900/60 rounded-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>NEXUS.AI Workspace Error</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              A runtime error occurred in the workspace interface:
            </p>
            <pre className="p-3 rounded bg-nexus-950 border border-nexus-border text-[11px] text-rose-300 whitespace-pre-wrap overflow-auto max-h-48">
              {this.state.error?.message || 'Unknown error'}
              {this.state.error?.stack && `\n\n${this.state.error.stack}`}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
