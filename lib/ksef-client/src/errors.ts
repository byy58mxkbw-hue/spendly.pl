// KsefError i KsefParseError mieszkają w @workspace/ksef-xml (parser współdzielony z
// przeglądarką) — tu re-eksport TYCH SAMYCH klas, żeby instanceof działał wszędzie.
import { KsefError, KsefParseError } from "@workspace/ksef-xml";
export { KsefError, KsefParseError };

export class KsefAuthError extends KsefError {
  override name = "KsefAuthError";
  constructor(message = "Token KSeF został odrzucony lub wygasł.", cause?: unknown) {
    super(message, cause);
  }
}

export class KsefRateLimitError extends KsefError {
  override name = "KsefRateLimitError";
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds = 0, message = "Przekroczono limit zapytań do KSeF (HTTP 429).", cause?: unknown) {
    super(message, cause);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class KsefServerError extends KsefError {
  override name = "KsefServerError";
  constructor(message = "KSeF zwrócił błąd serwera (5xx).", cause?: unknown) {
    super(message, cause);
  }
}

export class KsefNetworkError extends KsefError {
  override name = "KsefNetworkError";
  constructor(message = "Błąd sieci podczas komunikacji z KSeF.", cause?: unknown) {
    super(message, cause);
  }
}

