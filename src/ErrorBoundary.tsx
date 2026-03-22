import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    try {
      const parsed = JSON.parse(error.message);
      this.setState({ errorInfo: JSON.stringify(parsed, null, 2) });
    } catch (e) {
      this.setState({ errorInfo: error.message });
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-red-400 p-8 font-mono text-sm flex flex-col items-center justify-center">
          <div className="max-w-3xl w-full bg-zinc-900 border border-red-900/50 p-6 rounded-xl shadow-2xl">
            <h1 className="text-xl font-bold mb-4 text-red-500">Something went wrong</h1>
            <pre className="overflow-auto whitespace-pre-wrap bg-zinc-950 p-4 rounded-lg border border-zinc-800 text-red-300">
              {this.state.errorInfo || this.state.error?.message}
            </pre>
            <button
              className="mt-6 bg-red-900/50 hover:bg-red-900 text-red-200 px-4 py-2 rounded-lg transition-colors"
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
