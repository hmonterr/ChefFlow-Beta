import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorInfo: any;
}

export class FirebaseErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    try {
      const info = JSON.parse(error.message);
      return { hasError: true, errorInfo: info };
    } catch {
      return { hasError: true, errorInfo: { error: error.message } };
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
            <div className="flex items-center gap-3 text-red-600 mb-6">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-2xl font-bold">Connection Error</h2>
            </div>
            
            <div className="space-y-4 mb-8">
              <p className="text-gray-600">
                We encountered a problem communicating with the database. This usually happens due to permission issues or a temporary connection loss.
              </p>
              
              {this.state.errorInfo && (
                <div className="bg-gray-50 rounded-lg p-4 text-xs font-mono text-gray-500 overflow-auto max-h-40">
                  <p className="font-bold mb-1">Error Details:</p>
                  <pre>{JSON.stringify(this.state.errorInfo, null, 2)}</pre>
                </div>
              )}
            </div>

            <Button 
              className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCcw className="w-4 h-4" />
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
