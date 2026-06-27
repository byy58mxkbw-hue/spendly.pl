import { rateLimit } from "express-rate-limit";

/**
 * Per-user rate limiter for expensive, OpenAI-backed endpoints
 * (receipt OCR, AI CFO chat / food-cost / menu extraction).
 *
 * The global limiter in app.ts is keyed by IP and guards raw request volume.
 * This one is keyed by the authenticated Clerk user, so a single signed-in
 * account cannot rack up unbounded OpenAI spend (cost-abuse / denial-of-wallet)
 * from one IP — or dodge the per-IP limit by rotating IPs.
 *
 * Mounted only on the AI routes, AFTER `requireUser`, so `req.userId` is always
 * set by the time this runs (unauthenticated requests are rejected earlier).
 *
 * 40 requests / 15 min is generous for genuine interactive use (scanning
 * receipts or chatting one at a time) while still capping automated abuse.
 */
export const aiCostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Key by Clerk user, not IP. requireUser guarantees req.userId here; the
  // fallbacks only exist to satisfy the type and never trigger in practice.
  keyGenerator: (req) => req.userId ?? req.ip ?? "anonymous",
  // We intentionally key by a non-IP value; disable the IPv6-key validation
  // that only applies to IP-based keys.
  validate: { keyGeneratorIpFallback: false },
  message: {
    error:
      "Zbyt wiele zapytań AI w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
  },
});
