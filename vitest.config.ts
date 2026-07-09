import { defineConfig } from "vitest/config";

// Monorepo: osobne projekty dla API (node) i frontu (jsdom).
// Testy kolokowane jako *.test.ts / *.test.tsx obok kodu; wykluczone z produkcyjnego tsc.
// customConditions "workspace" — potrzebne, by rozwiązać importy @workspace/* (patrz tsconfig.base).
export default defineConfig({
  // W rootcie istnieje PLIK `public` (nie katalog) — bez tego Vite próbuje go skanować i pada (ENOTDIR).
  publicDir: false,
  test: {
    projects: [
      {
        publicDir: false,
        resolve: { conditions: ["workspace"] },
        test: {
          name: "api",
          environment: "node",
          // Dummy env, by import modułów serwera (encryption, clerk, db) nie wywrócił się bez sekretów.
          // pg/openai łączą się leniwie (dopiero przy zapytaniu), więc smoke /healthz nie potrzebuje żywej bazy.
          env: {
            NODE_ENV: "test",
            DATABASE_URL: "postgres://user:pass@localhost:5432/spendly_test",
            KSEF_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
            CLERK_SECRET_KEY: "sk_test_dummy",
            CLERK_PUBLISHABLE_KEY: "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
            OPENAI_API_KEY: "sk-dummy",
            ALLOWED_ORIGIN: "http://localhost",
          },
          include: ["artifacts/api-server/**/*.test.ts", "lib/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        publicDir: false,
        resolve: { conditions: ["workspace"] },
        test: {
          name: "web",
          environment: "jsdom",
          include: ["artifacts/ksef-monitor/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
