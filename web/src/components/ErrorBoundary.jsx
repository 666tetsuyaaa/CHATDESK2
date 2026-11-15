import { Component } from "react";

/**
 * Catches an unexpected error anywhere in the dashboard and shows a short
 * "Something went wrong" screen with Reload, instead of a blank white page.
 * (A newly deployed version can also make an old open tab fail to load a
 * page - reloading picks up the new one.)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Kept in the browser console for whoever is troubleshooting.
    console.error("ChatDesk dashboard error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center bg-app px-6 text-center">
        <div className="max-w-sm">
          <p className="text-2xl font-bold text-navy">
            Chat<span className="text-gold">Desk</span>
          </p>
          <h1 className="mt-6 text-xl font-bold text-navy">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            This page ran into a problem. Reloading usually fixes it - nothing you saved is lost.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-navy transition-opacity hover:opacity-90"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:border-gold"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
