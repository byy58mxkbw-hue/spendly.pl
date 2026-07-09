import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import ServerError from "@/pages/server-error";

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
    console.error("ErrorBoundary caught:", error, info);
    // No-op gdy Sentry nieaktywne (brak VITE_SENTRY_DSN).
    Sentry.captureException(error, { extra: { info } });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <ServerError onReset={this.handleReset} />;
  }
}
