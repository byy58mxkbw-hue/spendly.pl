// Bazowe błędy KSeF żyją tutaj (nie w @workspace/ksef-client), bo parser FA(3) jest
// współdzielony z przeglądarką (podgląd faktury XML), a klient KSeF ciągnie kod
// serwerowy. @workspace/ksef-client re-eksportuje te SAME klasy — `instanceof
// KsefParseError` w ingestii działa bez zmian.
export class KsefError extends Error {
  override name: string = "KsefError";
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export class KsefParseError extends KsefError {
  override name = "KsefParseError";
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}
