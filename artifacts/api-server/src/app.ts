import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const isProd = process.env.NODE_ENV !== "development";

app.set("trust proxy", 1);

// ── Nagłówki bezpieczeństwa (Helmet) ─────────────────────────────────────────
// To serwer API (zwraca JSON), więc CSP jest restrykcyjne — nic nie ładujemy.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  frameguard: { action: "deny" }, // X-Frame-Options: DENY
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // HSTS tylko na produkcji (HTTP localhost i tak go ignoruje).
  hsts: isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false,
}));

// ── Kompresja odpowiedzi (gzip/brotli) ───────────────────────────────────────
app.use(compression());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Globalny limit ochronny.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Za dużo żądań. Spróbuj ponownie za chwilę." },
  skip: (req) => req.path === "/api/healthz",
});

// Zaostrzony limit na kosztowne operacje AI.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Za dużo zapytań AI. Spróbuj ponownie za kilka minut." },
});

// Zaostrzony limit na synchronizację KSeF (chroni przed rate-limitem po stronie KSeF).
const ksefLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Za dużo synchronizacji KSeF. Spróbuj ponownie za godzinę." },
});

app.use(limiter);

// Limity per-endpoint (przed głównym routerem). Ścieżki zawierają prefiks /api.
app.use("/api/ai-cfo/chat", aiLimiter);
app.use("/api/ai-cfo/food-cost", aiLimiter);
app.use("/api/invoices/scan-receipt", aiLimiter);
app.use("/api/insights/generate", aiLimiter);
app.use("/api/ksef/sync", ksefLimiter);

// ── Timeout na długich operacjach ────────────────────────────────────────────
// Po 30s zwracamy 504 zamiast wisieć w nieskończoność.
function withTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(504).json({ error: "Operacja trwała zbyt długo. Spróbuj ponownie." });
      }
    });
    next();
  };
}
const OP_TIMEOUT = 30_000;
app.use("/api/ai-cfo/chat", withTimeout(OP_TIMEOUT));
app.use("/api/invoices/scan-receipt", withTimeout(OP_TIMEOUT));
app.use("/api/ksef/sync", withTimeout(OP_TIMEOUT));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Production origins come from ALLOWED_ORIGIN (comma-separated). Local dev origins
// stay hardcoded so `pnpm dev` keeps working without any env setup.
const envOrigins = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:22900",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:22900",
      ...envOrigins,
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, process.env.NODE_ENV === "development");
    }
  },
}));
app.use((req, res, next) => {
  const limit = req.path.includes("/invoices/scan-receipt") ? "15mb" : "2mb";
  express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// ── Globalny handler błędów ───────────────────────────────────────────────────
// Express 5 przekazuje tu odrzucone Promisy z handlerów async. Na produkcji
// NIE ujawniamy stack trace ani wewnętrznych komunikatów — tylko generyk.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  req.log?.error({ err }, "Unhandled route error");
  if (res.headersSent) return;
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode
    ?? 500;
  if (isProd) {
    res.status(status).json({ error: "Wystąpił błąd serwera. Spróbuj ponownie." });
  } else {
    res.status(status).json({
      error: (err as Error)?.message ?? "Internal error",
      stack: (err as Error)?.stack,
    });
  }
});

export default app;
