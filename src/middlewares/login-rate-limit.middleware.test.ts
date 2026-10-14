import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import { createLoginRateLimiters } from "./login-rate-limit.middleware.js";

const OPTIONS = { windowMs: 60_000, maxFailuresPerIp: 6, maxFailuresPerAccount: 3 };

async function startApp(options = OPTIONS): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use(express.json());
  app.post("/login", ...createLoginRateLimiters(options), (req, res) => {
    res.status(req.body?.password === "right" ? 200 : 401).json({});
  });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/login` };
}

async function attempt(url: string, email: string, password: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("login rate limiting", () => {
  const servers: Server[] = [];

  async function fresh(options = OPTIONS): Promise<string> {
    const { server, url } = await startApp(options);
    servers.push(server);
    return url;
  }

  after(() => {
    for (const server of servers) server.close();
  });

  it("blocks an account with 429 after the allowed failures, and says when to retry", async () => {
    const url = await fresh();

    for (let i = 0; i < 3; i++) {
      assert.equal((await attempt(url, "ana@x.com", "bad")).status, 401);
    }
    const blocked = await attempt(url, "ana@x.com", "bad");

    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { message: "Too many failed login attempts, please try again later" });
    assert.ok(blocked.headers.get("retry-after"));
  });

  it("keeps blocking even the correct password while locked out", async () => {
    const url = await fresh();
    for (let i = 0; i < 3; i++) await attempt(url, "ana@x.com", "bad");

    assert.equal((await attempt(url, "ana@x.com", "right")).status, 429);
  });

  it("does not count successful logins", async () => {
    const url = await fresh();

    for (let i = 0; i < 10; i++) {
      assert.equal((await attempt(url, "ana@x.com", "right")).status, 200);
    }
  });

  it("treats email case and surrounding spaces as the same account", async () => {
    const url = await fresh();
    await attempt(url, "ana@x.com", "bad");
    await attempt(url, "ANA@x.com", "bad");
    await attempt(url, "  ana@x.com ", "bad");

    assert.equal((await attempt(url, "Ana@X.com", "bad")).status, 429);
  });

  it("does not lock other accounts from the same IP", async () => {
    const url = await fresh();
    for (let i = 0; i < 3; i++) await attempt(url, "ana@x.com", "bad");

    assert.equal((await attempt(url, "luis@x.com", "bad")).status, 401);
  });

  it("caps total failures per IP across many accounts", async () => {
    const url = await fresh();

    for (let i = 0; i < 6; i++) {
      assert.equal((await attempt(url, `user${i}@x.com`, "bad")).status, 401);
    }

    assert.equal((await attempt(url, "another@x.com", "bad")).status, 429);
  });

  it("does not crash on a body without email", async () => {
    const url = await fresh();

    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

    assert.equal(res.status, 401);
  });
});
