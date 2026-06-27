import {
  createPublicKey,
  publicEncrypt,
  createDecipheriv,
  randomBytes,
  constants as cryptoConstants,
} from "node:crypto";
import { unzipSync } from "fflate";

import {
  KsefAuthError,
  KsefError,
  KsefNetworkError,
  KsefRateLimitError,
  KsefServerError,
} from "./errors";

export const KSEF_PRODUCTION_BASE_URL = "https://api.ksef.mf.gov.pl/api/v2";

export interface KsefSession {
  /** Final JWT access token returned by KSeF — passed as Bearer on subsequent calls. */
  sessionToken: string;
  /** NIP of the authenticated context. */
  nip: string;
  /** Base URL of the KSeF environment (defaults to production). */
  baseUrl: string;
  /** Issuance timestamp (ms). */
  issuedAt: number;
  /** Access-token expiry (ms epoch), when KSeF provides it — enables session reuse across syncs. */
  validUntil?: number;
}

export interface KsefInvoiceListItem {
  ksefReferenceNumber: string;
  invoiceNumber: string;
  issueDate: string;
  sellerNip: string;
  buyerNip: string;
  invoicingMode?: string;
  invoiceType?: string;
}

export interface ListInvoicesParams {
  subjectType: "buyer" | "seller";
  nip: string;
  dateFrom: string; // ISO date (YYYY-MM-DD) or full ISO datetime
  dateTo: string;
  pageOffset?: number;
  pageSize?: number;
}

export interface ListInvoicesResult {
  invoices: KsefInvoiceListItem[];
  hasMore: boolean;
  nextOffset: number;
  isTruncated: boolean;
}

export interface ExportInvoicesParams {
  subjectType: "buyer" | "seller";
  dateFrom: string; // YYYY-MM-DD or full ISO
  dateTo: string;
}

export interface ExportedInvoice {
  /** KSeF reference number — taken from the package entry's filename. */
  ksefReferenceNumber: string;
  xml: string;
}

export interface ExportProgress {
  phase: "starting" | "preparing" | "downloading" | "done";
  invoiceCount?: number;
  partsDone?: number;
  partsTotal?: number;
}

type Logger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

const NOOP_LOGGER: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface KsefClientOptions {
  baseUrl?: string;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  /** Max retries for 429 / 5xx (default 3). */
  maxRetries?: number;
  /** Max attempts when polling the auth status endpoint (default 15, ~15s). */
  authPollAttempts?: number;
  /** Delay between auth polling attempts in ms (default 1000). */
  authPollDelayMs?: number;
}

function maskToken(token: string): string {
  if (token.length <= 4) return "****";
  return `****${token.slice(-4)}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCertificatePem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN CERTIFICATE")) return trimmed;
  const base64 = trimmed.replace(/\s+/g, "");
  const wrapped = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

/** RSA-OAEP (SHA-256) encrypt — wraps the export's symmetric AES key for KSeF. */
function rsaOaepEncryptSha256(pem: string, data: Buffer): Buffer {
  const key = createPublicKey({ key: pem, format: "pem" });
  return publicEncrypt(
    { key, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    data,
  );
}

/** AES-256-CBC decrypt — the KSeF invoice export package is AES-256-CBC encrypted. */
function aes256CbcDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

interface PublicKeyCertificate {
  certificate?: string;
  publicKey?: string;
  publicKeyId?: string;
  certificateId?: string;
  usage?: string | string[];
  purpose?: string | string[];
  type?: string | string[];
  validFrom?: string;
  validTo?: string;
}

interface PublicKeyCertificatesResponse {
  publicKeyCertificates?: PublicKeyCertificate[];
  certificates?: PublicKeyCertificate[];
}

interface ChallengeResponse {
  challenge: string;
  timestamp: string | number;
  /** Current Unix time in milliseconds — what must be used in the encrypted plaintext. */
  timestampMs?: number;
}

interface AuthSubmitResponse {
  referenceNumber?: string;
  authenticationToken?: {
    token?: string;
    validUntil?: string;
  };
  // some shapes
  token?: string;
}

interface AuthStatusResponse {
  status?: { code?: number; description?: string } | string;
  authenticationTokenStatus?: { code?: number; description?: string };
}

interface RedeemResponse {
  accessToken?: { token?: string; validUntil?: string } | string;
  refreshToken?: { token?: string; validUntil?: string } | string;
  token?: string;
}

/**
 * Low-level KSeF 2.0 client.
 *
 * Authentication flow (KSeF token):
 *   1. GET  /security/public-key-certificates       → RSA public key (usage = KsefTokenEncryption)
 *   2. POST /auth/challenge                         → { challenge, timestamp }
 *   3. Encrypt `<token>|<timestamp>` with RSA-OAEP-SHA256 → base64 encryptedToken
 *   4. POST /auth/ksef-token                        → { authenticationToken (temp JWT), referenceNumber }
 *   5. GET  /auth/{referenceNumber} (Bearer temp)   → poll until success
 *   6. POST /auth/token/redeem (Bearer temp)        → { accessToken (JWT), refreshToken }
 */
export class KsefClient {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly authPollAttempts: number;
  private readonly authPollDelayMs: number;

  constructor(opts: KsefClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? KSEF_PRODUCTION_BASE_URL).replace(/\/+$/, "");
    this.logger = opts.logger ?? NOOP_LOGGER;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
    this.authPollAttempts = opts.authPollAttempts ?? 15;
    this.authPollDelayMs = opts.authPollDelayMs ?? 1000;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { responseType?: "json" | "text" } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const { responseType = "json", headers, ...rest } = init;

    const mergedHeaders = new Headers(headers ?? {});
    if (!mergedHeaders.has("Accept")) {
      mergedHeaders.set("Accept", responseType === "json" ? "application/json" : "application/xml, text/xml, */*");
    }

    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url, { ...rest, headers: mergedHeaders });

        if (res.status === 401 || res.status === 403) {
          const body = await res.text().catch(() => "");
          throw new KsefAuthError(
            `KSeF odrzucił żądanie (HTTP ${res.status}). Sprawdź token i NIP w ustawieniach. ${body.slice(0, 200)}`.trim(),
          );
        }

        if (res.status === 429) {
          const requested = Number(res.headers.get("Retry-After")) || 2 ** attempt;
          // Per-invoice XML fetches: surface the throttle immediately so the sync
          // loop's adaptive pacing owns the back-off/retry decision (single owner —
          // avoids this client and the caller both waiting and stacking delays).
          const isPerInvoiceFetch = /^\/invoices\/ksef\//.test(path);
          if (isPerInvoiceFetch) {
            this.logger.warn({ url: path, retryAfter: requested }, "KSeF 429 (per-invoice), surfacing to caller");
            throw new KsefRateLimitError(requested);
          }
          // Metadata/auth calls: we really need these to succeed, so retry in-client
          // up to a larger cap.
          if (attempt < this.maxRetries && requested <= 60) {
            this.logger.warn({ url: path, attempt, retryAfter: requested }, "KSeF 429, retrying");
            await sleep(requested * 1000);
            continue;
          }
          this.logger.warn({ url: path, attempt, retryAfter: requested }, "KSeF 429, giving up");
          throw new KsefRateLimitError(requested);
        }

        if (res.status >= 500) {
          if (attempt < this.maxRetries) {
            this.logger.warn({ url: path, attempt, status: res.status }, "KSeF 5xx, retrying");
            await sleep(2 ** attempt * 500);
            continue;
          }
          const body = await res.text().catch(() => "");
          throw new KsefServerError(`KSeF zwrócił HTTP ${res.status}: ${body.slice(0, 200)}`);
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // KSeF returns auth errors as HTTP 400 with exception codes 21300–21399.
          // Treat these as KsefAuthError so callers surface a user-friendly message.
          if (res.status === 400) {
            try {
              const parsed = JSON.parse(body) as {
                exception?: { exceptionDetailList?: Array<{ exceptionCode?: number }> };
              };
              const codes =
                parsed?.exception?.exceptionDetailList?.map((e) => e.exceptionCode) ?? [];
              if (codes.some((c) => typeof c === "number" && c >= 21300 && c <= 21399)) {
                throw new KsefAuthError(
                  `KSeF odrzucił token (kod ${String(codes[0])}). Wygeneruj nowy token w aplikacji KSeF i zapisz go w Ustawieniach.`,
                );
              }
            } catch (parseErr) {
              if (parseErr instanceof KsefAuthError) throw parseErr;
            }
          }
          throw new KsefError(`KSeF HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        if (res.status === 204) {
          return undefined as unknown as T;
        }

        if (responseType === "text") {
          return (await res.text()) as unknown as T;
        }
        const text = await res.text();
        if (!text) return undefined as unknown as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new KsefError(
            `KSeF zwrócił odpowiedź, której nie udało się sparsować jako JSON. Pierwsze znaki: ${text.slice(0, 200)}`,
          );
        }
      } catch (err) {
        if (err instanceof KsefError) throw err;
        lastErr = err;
        if (attempt < this.maxRetries) {
          this.logger.warn({ url: path, attempt, err: String(err) }, "KSeF network error, retrying");
          await sleep(2 ** attempt * 500);
          continue;
        }
        throw new KsefNetworkError(
          `Błąd sieci podczas wywołania KSeF: ${(err as Error).message}`,
          err,
        );
      }
    }
    throw new KsefNetworkError("Wyczerpano liczbę prób połączenia z KSeF.", lastErr);
  }

  private async fetchTokenEncryptionCertificate(): Promise<string> {
    const res = await this.request<PublicKeyCertificatesResponse | PublicKeyCertificate[]>(
      `/security/public-key-certificates`,
      { method: "GET" },
    );
    const list: PublicKeyCertificate[] = Array.isArray(res)
      ? res
      : (res.publicKeyCertificates ?? res.certificates ?? []);
    const now = Date.now();
    const isValid = (c: PublicKeyCertificate) => {
      const from = c.validFrom ? Date.parse(c.validFrom) : 0;
      const to = c.validTo ? Date.parse(c.validTo) : Number.MAX_SAFE_INTEGER;
      return now >= from && now <= to;
    };
    const usagesOf = (c: PublicKeyCertificate): string[] => {
      const raw = c.usage ?? c.purpose ?? c.type;
      if (raw == null) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.filter((u): u is string => typeof u === "string").map((u) => u.toLowerCase());
    };
    const exactMatch = list.find(
      (c) => usagesOf(c).includes("kseftokenencryption") && isValid(c),
    );
    const looseMatch = list.find(
      (c) => usagesOf(c).some((u) => u.includes("kseftoken")) && isValid(c),
    );
    const anyValidWithoutUsage = list.find(
      (c) => usagesOf(c).length === 0 && isValid(c),
    );
    const pick = exactMatch ?? looseMatch ?? anyValidWithoutUsage;
    if (!pick) {
      throw new KsefAuthError(
        "Nie znaleziono ważnego certyfikatu KsefTokenEncryption w odpowiedzi /security/public-key-certificates.",
      );
    }
    const cert = pick?.certificate ?? pick?.publicKey;
    if (!cert) {
      throw new KsefAuthError(
        "KSeF nie zwrócił certyfikatu szyfrowania tokena (KsefTokenEncryption).",
      );
    }
    return cert;
  }

  /**
   * Exchange a KSeF token (generated in MCU) for a session JWT bound to the given NIP.
   */
  async authenticate(nip: string, token: string): Promise<KsefSession> {
    this.logger.info({ nip, token: maskToken(token) }, "KSeF authenticate");

    // 1. Public key for token encryption
    const certPem = normalizeCertificatePem(await this.fetchTokenEncryptionCertificate());
    const publicKey = createPublicKey({ key: certPem, format: "pem" });

    // 2. Challenge
    const challenge = await this.request<ChallengeResponse>(`/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!challenge?.challenge || (challenge.timestampMs == null && challenge.timestamp == null)) {
      throw new KsefAuthError("KSeF nie zwrócił poprawnego challenge.");
    }

    // 3. Encrypt `token|timestampMs` with RSA-OAEP-SHA256.
    // KSeF requires the Unix-ms numeric timestamp from `challenge.timestampMs`,
    // NOT the ISO `challenge.timestamp` field (which would yield auth status 450
    // "Uwierzytelnianie zakończone niepowodzeniem z powodu błędnego tokenu").
    const tsForEncryption =
      typeof challenge.timestampMs === "number"
        ? challenge.timestampMs
        : typeof challenge.timestamp === "number"
          ? challenge.timestamp
          : Date.parse(String(challenge.timestamp));
    if (!Number.isFinite(tsForEncryption)) {
      throw new KsefAuthError(
        "KSeF zwrócił challenge z nieprawidłowym znacznikiem czasu.",
      );
    }
    const plaintext = Buffer.from(`${token}|${tsForEncryption}`, "utf-8");
    const encrypted = publicEncrypt(
      {
        key: publicKey,
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      plaintext,
    );
    const encryptedToken = encrypted.toString("base64");

    // 4. Submit
    const submit = await this.request<AuthSubmitResponse>(`/auth/ksef-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge: challenge.challenge,
        contextIdentifier: { type: "Nip", value: nip },
        encryptedToken,
      }),
    });

    const tempToken = submit.authenticationToken?.token ?? submit.token;
    const referenceNumber = submit.referenceNumber;
    if (!tempToken || !referenceNumber) {
      throw new KsefAuthError(
        "KSeF nie zwrócił tokena tymczasowego ani numeru referencyjnego autoryzacji.",
      );
    }

    // 5. Poll status until success
    let succeeded = false;
    let lastStatus: unknown = null;
    for (let i = 0; i < this.authPollAttempts; i++) {
      await sleep(this.authPollDelayMs);
      const status = await this.request<AuthStatusResponse>(
        `/auth/${encodeURIComponent(referenceNumber)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${tempToken}` },
        },
      );
      lastStatus = status;
      const rawCode =
        typeof status.status === "object"
          ? status.status?.code
          : typeof status.status === "string"
            ? status.status
            : status.authenticationTokenStatus?.code;
      const codeNum =
        typeof rawCode === "number"
          ? rawCode
          : typeof rawCode === "string" && /^\d+$/.test(rawCode)
            ? Number(rawCode)
            : undefined;
      const desc = (
        typeof status.status === "object"
          ? (status.status?.description ?? "")
          : typeof status.status === "string"
            ? (status.status as string)
            : (status.authenticationTokenStatus?.description ?? "")
      ).toLowerCase();
      if (
        codeNum === 200 ||
        codeNum === 315 ||
        desc.includes("success") ||
        desc.includes("authenticated") ||
        desc.includes("authentication successful") ||
        desc.includes("completed") ||
        desc.includes("zakończ")
      ) {
        succeeded = true;
        break;
      }
      if (
        (typeof codeNum === "number" && codeNum >= 400) ||
        desc.includes("fail") ||
        desc.includes("error") ||
        desc.includes("rejected") ||
        desc.includes("denied") ||
        desc.includes("odrzuc") ||
        desc.includes("błąd")
      ) {
        throw new KsefAuthError(
          `Autoryzacja KSeF nieudana: ${JSON.stringify(status).slice(0, 300)}`,
        );
      }
    }
    if (!succeeded) {
      throw new KsefAuthError(
        `Autoryzacja KSeF nie zakończyła się w wymaganym czasie. Ostatni status: ${JSON.stringify(lastStatus).slice(0, 300)}`,
      );
    }

    // 6. Redeem final accessToken
    const redeem = await this.request<RedeemResponse>(`/auth/token/redeem`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tempToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const accessToken =
      typeof redeem.accessToken === "string"
        ? redeem.accessToken
        : (redeem.accessToken?.token ?? redeem.token);

    if (!accessToken) {
      throw new KsefAuthError("KSeF nie zwrócił finalnego tokena dostępu.");
    }

    const validUntilRaw =
      typeof redeem.accessToken === "object" ? redeem.accessToken?.validUntil : undefined;
    const validUntilMs = validUntilRaw ? Date.parse(validUntilRaw) : NaN;

    return {
      sessionToken: accessToken,
      nip,
      baseUrl: this.baseUrl,
      issuedAt: Date.now(),
      validUntil: Number.isFinite(validUntilMs) ? validUntilMs : undefined,
    };
  }

  async listInvoices(
    session: KsefSession,
    params: ListInvoicesParams,
  ): Promise<ListInvoicesResult> {
    const pageOffset = params.pageOffset ?? 0;
    // KSeF 2.0 metadata query requires pageSize between 10 and 250.
    const pageSize = Math.min(250, Math.max(10, params.pageSize ?? 100));

    const subjectType = params.subjectType === "buyer" ? "Subject2" : "Subject1";

    // Endpoint: POST /invoices/query/metadata. Body is the filter object directly
    // (NOT wrapped in `{filters: ...}`). Response: {hasMore, isTruncated, invoices[]}.
    const res = await this.request<{
      invoices?: Array<Record<string, unknown>>;
      hasMore?: boolean;
      isTruncated?: boolean;
    }>(`/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.sessionToken}`,
      },
      body: JSON.stringify({
        subjectType,
        dateRange: {
          // See exportInvoices: window by KSeF permanent-storage (acquisition)
          // date, not issue date, so late-submitted invoices aren't skipped.
          dateType: "PermanentStorage",
          from: params.dateFrom.includes("T")
            ? params.dateFrom
            : `${params.dateFrom}T00:00:00+00:00`,
          to: params.dateTo.includes("T")
            ? params.dateTo
            : `${params.dateTo}T23:59:59+00:00`,
        },
      }),
    });

    const raw = res.invoices ?? [];
    const invoices: KsefInvoiceListItem[] = raw
      .map((row) => {
        const seller = (row.seller ?? {}) as Record<string, unknown>;
        const buyer = (row.buyer ?? {}) as Record<string, unknown>;
        const buyerId = (buyer.identifier ?? {}) as { value?: string };
        return {
          ksefReferenceNumber:
            (row.ksefNumber as string) ??
            (row.ksefReferenceNumber as string) ??
            "",
          invoiceNumber: (row.invoiceNumber as string) ?? "",
          issueDate:
            (row.issueDate as string) ??
            (row.invoicingDate as string) ??
            (row.acquisitionDate as string) ??
            "",
          sellerNip: (seller.nip as string) ?? "",
          buyerNip:
            (buyerId.value as string) ??
            (buyer.nip as string) ??
            "",
          invoicingMode: row.invoicingMode as string | undefined,
          invoiceType: row.invoiceType as string | undefined,
        };
      })
      .filter((i) => i.ksefReferenceNumber);

    const nextOffset = pageOffset + invoices.length;
    const hasMore = res.hasMore ?? invoices.length === pageSize;
    const isTruncated = res.isTruncated === true;

    return { invoices, hasMore, nextOffset, isTruncated };
  }

  async getInvoiceXml(session: KsefSession, ksefReferenceNumber: string): Promise<string> {
    // KSeF 2.0: GET /invoices/ksef/{ksefNumber} → application/xml
    return this.request<string>(`/invoices/ksef/${encodeURIComponent(ksefReferenceNumber)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.sessionToken}`,
        Accept: "application/xml",
      },
      responseType: "text",
    });
  }

  // ─── Bulk invoice export (KSeF v2 async package) ──────────────────────────────

  /** Fetch the cert used to wrap the export's symmetric key (usage: SymmetricKeyEncryption). */
  private async fetchSymmetricKeyCertificate(): Promise<{ pem: string; publicKeyId: string }> {
    const res = await this.request<PublicKeyCertificatesResponse | PublicKeyCertificate[]>(
      `/security/public-key-certificates`,
      { method: "GET" },
    );
    const list: PublicKeyCertificate[] = Array.isArray(res)
      ? res
      : (res.publicKeyCertificates ?? res.certificates ?? []);
    const now = Date.now();
    const isValid = (c: PublicKeyCertificate) => {
      const from = c.validFrom ? Date.parse(c.validFrom) : 0;
      const to = c.validTo ? Date.parse(c.validTo) : Number.MAX_SAFE_INTEGER;
      return now >= from && now <= to;
    };
    const usagesOf = (c: PublicKeyCertificate): string[] => {
      const raw = c.usage ?? c.purpose ?? c.type;
      if (raw == null) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.filter((u): u is string => typeof u === "string").map((u) => u.toLowerCase());
    };
    const pick =
      list.find((c) => usagesOf(c).includes("symmetrickeyencryption") && isValid(c)) ??
      list.find((c) => usagesOf(c).some((u) => u.includes("symmetric")) && isValid(c)) ??
      list.find((c) => usagesOf(c).length === 0 && isValid(c));
    const cert = pick?.certificate ?? pick?.publicKey;
    if (!cert) {
      throw new KsefError(
        "Nie znaleziono certyfikatu SymmetricKeyEncryption do eksportu paczki faktur z KSeF.",
      );
    }
    return {
      pem: normalizeCertificatePem(cert),
      publicKeyId: pick?.publicKeyId ?? pick?.certificateId ?? "",
    };
  }

  private async downloadExportPart(url: string, session: KsefSession): Promise<Buffer> {
    const isAbsolute = /^https?:\/\//i.test(url);
    const fullUrl = isAbsolute ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    const headers: Record<string, string> = { Accept: "application/octet-stream" };
    // Pre-signed blob URLs authorise themselves; a relative API path still needs the Bearer.
    if (!isAbsolute) headers.Authorization = `Bearer ${session.sessionToken}`;
    const res = await this.fetchImpl(fullUrl, { method: "GET", headers });
    if (!res.ok) {
      throw new KsefError(`Pobieranie części paczki nie powiodło się (HTTP ${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Bulk-export invoices via the KSeF v2 async package API — one job instead of one
   * request per invoice, sidestepping the per-invoice download rate limit.
   *
   * Flow: pick SymmetricKeyEncryption cert → generate AES-256 key+IV → RSA-OAEP-SHA256
   * wrap the key → POST /invoices/exports → poll GET /invoices/exports/{ref} until the
   * package is ready → download parts → concat → AES-256-CBC decrypt → unzip → XMLs.
   * Each invoice's KSeF reference number is taken from its filename inside the ZIP.
   */
  async exportInvoices(
    session: KsefSession,
    params: ExportInvoicesParams,
    onProgress?: (p: ExportProgress) => void,
    opts: { pollDelayMs?: number; maxPolls?: number } = {},
  ): Promise<ExportedInvoice[]> {
    const pollDelayMs = opts.pollDelayMs ?? 2500;
    const maxPolls = opts.maxPolls ?? 120; // ~5 min ceiling

    const { pem, publicKeyId } = await this.fetchSymmetricKeyCertificate();
    const aesKey = randomBytes(32);
    const iv = randomBytes(16);
    const encryptedSymmetricKey = rsaOaepEncryptSha256(pem, aesKey).toString("base64");
    const subjectType = params.subjectType === "buyer" ? "Subject2" : "Subject1";

    onProgress?.({ phase: "starting" });
    const start = await this.request<{ referenceNumber?: string }>(`/invoices/exports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.sessionToken}`,
      },
      body: JSON.stringify({
        encryption: {
          encryptedSymmetricKey,
          initializationVector: iv.toString("base64"),
          ...(publicKeyId ? { publicKeyId } : {}),
        },
        onlyMetadata: false,
        filters: {
          subjectType,
          dateRange: {
            // Filter by the date the invoice entered KSeF permanent storage,
            // NOT its issue date ("Invoicing"). Sellers often submit to KSeF
            // days after issuing, so windowing by issue date permanently skips
            // late-submitted invoices whose issue date precedes our sync cursor.
            // PermanentStorage is monotonic, so incremental [from,to] windows
            // catch every invoice that arrived since the last sync.
            dateType: "PermanentStorage",
            from: params.dateFrom.includes("T") ? params.dateFrom : `${params.dateFrom}T00:00:00+00:00`,
            to: params.dateTo.includes("T") ? params.dateTo : `${params.dateTo}T23:59:59+00:00`,
          },
        },
        compressionType: "Zip",
      }),
    });
    const referenceNumber = start.referenceNumber;
    if (!referenceNumber) {
      throw new KsefError("KSeF nie zwrócił numeru referencyjnego eksportu.");
    }

    interface ExportStatus {
      status?: { code?: number; description?: string };
      package?: {
        invoiceCount?: number;
        isTruncated?: boolean;
        parts?: Array<{ ordinalNumber: number; partName: string; method?: string; url: string }>;
      };
    }

    let pkg: NonNullable<ExportStatus["package"]> | undefined;
    for (let i = 0; i < maxPolls; i++) {
      await sleep(pollDelayMs);
      const status = await this.request<ExportStatus>(
        `/invoices/exports/${encodeURIComponent(referenceNumber)}`,
        { method: "GET", headers: { Authorization: `Bearer ${session.sessionToken}` } },
      );
      if (status.package?.parts && status.package.parts.length > 0) {
        pkg = status.package;
        break;
      }
      const code = status.status?.code;
      if (typeof code === "number" && code >= 400) {
        throw new KsefError(`Eksport KSeF nie powiódł się: ${status.status?.description ?? code}`);
      }
      onProgress?.({ phase: "preparing", invoiceCount: status.package?.invoiceCount });
    }
    if (!pkg) {
      throw new KsefError("Eksport KSeF nie został przygotowany w wyznaczonym czasie.");
    }

    const parts = [...(pkg.parts ?? [])].sort((a, b) => a.ordinalNumber - b.ordinalNumber);
    const encryptedChunks: Buffer[] = [];
    for (let i = 0; i < parts.length; i++) {
      onProgress?.({ phase: "downloading", partsDone: i, partsTotal: parts.length });
      encryptedChunks.push(await this.downloadExportPart(parts[i].url, session));
    }

    // Parts are byte-chunks of one AES-256-CBC encrypted ZIP — concat then decrypt.
    const zipBytes = aes256CbcDecrypt(aesKey, iv, Buffer.concat(encryptedChunks));
    const files = unzipSync(new Uint8Array(zipBytes));

    const out: ExportedInvoice[] = [];
    for (const name of Object.keys(files)) {
      if (!name.toLowerCase().endsWith(".xml")) continue;
      const ref = name.split(/[\\/]/).pop()!.replace(/\.xml$/i, "");
      out.push({ ksefReferenceNumber: ref, xml: Buffer.from(files[name]).toString("utf8") });
    }
    onProgress?.({ phase: "done", invoiceCount: out.length });
    return out;
  }
}
