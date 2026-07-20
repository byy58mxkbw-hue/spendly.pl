import { Component, type ReactNode } from "react";
import { captureException } from "@/lib/sentry";
import ServerError from "@/pages/server-error";
import { isChunkLoadError, reloadOnceForStaleChunks } from "@/lib/stale-chunk";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Globalny error boundary — łapie błędy renderowania i pokazuje czytelny ekran
 * zamiast białej strony. React nie udostępnia tego jako hooka, więc musi być klasą.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown): void {
    // Stary chunk po deployu (nie realny bug) — przeładuj po świeży index.html,
    // nie pokazuj ekranu 500 i nie raportuj do Sentry.
    if (isChunkLoadError(error)) {
      reloadOnceForStaleChunks();
      return;
    }
    console.error("ErrorBoundary caught:", error, info);
    // No-op gdy Sentry nieaktywne (brak VITE_SENTRY_DSN); SDK doładowywane leniwie.
    captureException(error, { info });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    // Błąd ładowania chunku → trwa przeładowanie, nie migaj ekranem 500.
    if (isChunkLoadError(this.state.error)) return null;
    return <ServerError onReset={this.handleReset} />;
  }
}
