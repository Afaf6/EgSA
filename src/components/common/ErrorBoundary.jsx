import React, { Component } from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Retain full diagnostic info in console for debugging
    console.error("[ErrorBoundary] Caught unhandled view error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="container py-5 d-flex align-items-center justify-content-center" style={{ minHeight: "50vh" }}>
          <div className="egse-panel p-4 text-center mx-auto" style={{ maxWidth: "560px", width: "100%" }}>
            <div
              className="p-3 rounded-circle mb-3 d-inline-flex align-items-center justify-content-center"
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                color: "var(--egse-alarm, #ef4444)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
              }}
            >
              <AlertTriangle size={36} />
            </div>
            <h2 className="h5 fw-bold mb-2">Something went wrong</h2>
            <p className="text-muted small mb-3">
              An unexpected error occurred while rendering this view. Try reloading the page or returning to the Mission Dashboard.
            </p>
            {this.state.error?.message && (
              <div
                className="p-2 mb-3 rounded text-start font-monospace small bg-dark text-danger border border-danger border-opacity-25 overflow-auto"
                style={{ maxHeight: "100px", fontSize: "0.75rem" }}
              >
                {this.state.error.message}
              </div>
            )}
            <div className="d-flex flex-wrap align-items-center justify-content-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                onClick={this.handleReset}
              >
                Try Again
              </button>
              <button
                type="button"
                className="btn btn-sm btn-egse-primary d-inline-flex align-items-center gap-1"
                onClick={this.handleReload}
              >
                <RefreshCw size={14} />
                Reload Page
              </button>
              <Link
                to="/dashboard"
                className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
                onClick={this.handleReset}
              >
                <LayoutDashboard size={14} />
                Mission Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
