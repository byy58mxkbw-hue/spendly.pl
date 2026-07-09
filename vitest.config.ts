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
