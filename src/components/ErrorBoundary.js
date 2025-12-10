import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * ErrorBoundary - Catches JavaScript errors in child component tree
 *
 * Without this, errors during render cause the entire app to crash with a blank screen.
 * This component catches errors and displays a friendly error message with recovery options.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo?.componentStack);

    this.setState({ errorInfo });

    // You could also log to an error reporting service here
    // e.g., Sentry, LogRocket, etc.
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      return (
        <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-zinc-900' : 'bg-gray-50'}`}>
          <div className={`max-w-md w-full rounded-2xl p-6 shadow-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-full ${isDark ? 'bg-red-900/30' : 'bg-red-100'}`}>
                <AlertTriangle className={`w-6 h-6 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              </div>
              <div>
                <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Something went wrong
                </h1>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  An unexpected error occurred
                </p>
              </div>
            </div>

            {/* Error details (collapsible) */}
            {this.state.error && (
              <details className={`mb-4 p-3 rounded-lg text-sm ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}>
                <summary className={`cursor-pointer font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Technical Details
                </summary>
                <pre className={`mt-2 text-xs overflow-auto max-h-32 whitespace-pre-wrap ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className={`mt-2 text-xs overflow-auto max-h-32 whitespace-pre-wrap ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            {/* Recovery options */}
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
              >
                <RefreshCw size={18} />
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-medium transition-colors ${
                  isDark
                    ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Home size={18} />
                Go to Dashboard
              </button>
              <button
                onClick={this.handleReload}
                className={`w-full px-4 py-2 text-sm ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Reload Page
              </button>
            </div>

            <p className={`mt-4 text-xs text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              If this keeps happening, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
