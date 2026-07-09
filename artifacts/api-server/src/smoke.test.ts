import { describe, it, expect, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "./app";

// Faza 0.3 — smoke: cały serwer musi się zbootować i odpowiedzieć na publiczny healthz.
// Wykrywa, gdy app nie wstaje (błąd importu route'ów/middleware) albo healthz przestaje działać.
let server: Server;
afterAll(() => { server?.close(); });

describe("smoke (api): serwer wstaje", () => {
  it("GET /api/healthz → 200 { status: ok }", async () => {
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
