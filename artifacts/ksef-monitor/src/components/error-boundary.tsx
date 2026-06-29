import { Component, type ReactNode } from "react";
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
    // Loguj do konsoli — w przyszłości można podpiąć Sentry itp.
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <ServerError onReset={this.handleReset} />;
  }
}
