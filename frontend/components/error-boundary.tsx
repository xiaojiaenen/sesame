"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="relative mb-6 inline-flex">
              <div className="absolute inset-0 bg-destructive/10 rounded-full blur-2xl scale-150" />
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 ring-1 ring-destructive/20 flex items-center justify-center relative">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">页面出现异常</h2>
            <p className="text-sm text-muted-foreground mb-6">
              应用遇到了意外错误，请尝试刷新页面恢复。
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/60 font-mono mb-6 p-3 bg-muted rounded-lg text-left break-all">
                {this.state.error.message}
              </p>
            )}
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新页面
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
