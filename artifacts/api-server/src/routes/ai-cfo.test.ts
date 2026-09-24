import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Test limitu rund pętli function-calling (brief: max 4 przebiegi, żeby model nie
// mógł wygenerować kosztownej pętli w nieskończoność). Mockujemy WYŁĄCZNIE klienta
// OpenAI (wzorzec z categorize-ai.test.ts) tak, żeby ZAWSZE prosił o narzędzie —
// nigdy nie kończy sam. Uderzamy w prawdziwy route (jak tenant-isolation.test.ts),
// bo aiQuota middleware i tak dotyka bazy na /ai-cfo/chat.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const createMock = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  requireOpenAI: () => ({ chat: { completions: { create: (...args: unknown[]) => createMock(...args) } } }),
  aiObservabilityEnabled: false,
}));

const authState = vi.hoisted(() => ({ userId: "test_ai_cfo_loop" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

// Zawsze odpowiada wywołaniem tego samego narzędzia — model, który nigdy nie
// "kończy" (najgorszy scenariusz, jaki limit rund musi obsłużyć).
function alwaysWantsToolCall() {
  createMock.mockResolvedValueOnce({
    choices: [{
      message: {
        content: null,
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "get_price_alerts", arguments: "{}" },
        }],
      },
    }],
  });
}

describe.skipIf(!RUN_DB)("limit rund pętli function-calling: POST /api/ai-cfo/chat", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("model, który zawsze prosi o narzędzie, nie wisi w nieskończoność — max 4 wywołania modelu", async () => {
    createMock.mockReset();
    alwaysWantsToolCall();
    alwaysWantsToolCall();
    alwaysWantsToolCall();
    alwaysWantsToolCall();

    const res = await fetch(`${baseUrl}/api/ai-cfo/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "jakie mam alerty cenowe" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; summary: string };
    expect(body.type).toBe("general");
    expect(createMock).toHaveBeenCalledTimes(4);

    // Ostatnie wywołanie (4-ta runda) MUSI iść bez `tools` — inaczej model może
    // wiecznie prosić o kolejne narzędzie i limit nic nie daje.
    const lastCallArgs = createMock.mock.calls[3][0] as { tools?: unknown };
    expect(lastCallArgs.tools).toBeUndefined();
  });

  it("model, który odpowiada od razu (bez tool_calls), zużywa tylko 1 wywołanie", async () => {
    createMock.mockReset();
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            type: "general",
            summary: "Test — brak potrzeby narzędzi.",
            kpiCards: [],
            table: null,
            recommendation: "",
            actions: [],
          }),
          tool_calls: [],
        },
      }],
    });

    const res = await fetch(`${baseUrl}/api/ai-cfo/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "ile wydałem ostatnio" }),
    });

    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
