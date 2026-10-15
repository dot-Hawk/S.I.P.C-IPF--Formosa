import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import { createHttpSecurity, parseCorsOrigins } from "./http-security.middleware.js";

describe("parseCorsOrigins", () => {
  it("splits a comma separated list, trimming blanks and trailing slashes", () => {
    assert.deepEqual(parseCorsOrigins(" https://a.example.com/ , http://localhost:5173,, "), [
      "https://a.example.com",
      "http://localhost:5173",
    ]);
  });

  it("is empty when nothing is configured", () => {
    assert.deepEqual(parseCorsOrigins(undefined), []);
    assert.deepEqual(parseCorsOrigins("   "), []);
  });
});

describe("http security middleware", () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use(...createHttpSecurity(["https://app.example.com"]));
    app.get("/ping", (_req, res) => res.json({ ok: true }));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
  });

  it("sends the helmet headers and does not announce Express", async () => {
    const res = await fetch(`${base}/ping`);

    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.ok(res.headers.get("strict-transport-security"));
  });

  it("allows a configured origin and exposes the download filename header", async () => {
    const res = await fetch(`${base}/ping`, { headers: { origin: "https://app.example.com" } });

    assert.equal(res.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.match(res.headers.get("access-control-expose-headers") ?? "", /Content-Disposition/i);
  });

  it("gives no CORS permission to an unknown origin", async () => {
    const res = await fetch(`${base}/ping`, { headers: { origin: "https://evil.example.com" } });

    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("answers the preflight for the headers the API uses", async () => {
    const res = await fetch(`${base}/ping`, {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    assert.equal(res.status, 204);
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /PATCH/);
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /authorization/i);
  });

  it("without configured origins no origin is allowed", async () => {
    const app = express();
    app.use(...createHttpSecurity([]));
    app.get("/ping", (_req, res) => res.json({ ok: true }));
    const s = await new Promise<Server>((resolve) => {
      const x = app.listen(0, "127.0.0.1", () => resolve(x));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/ping`, {
        headers: { origin: "https://app.example.com" },
      });
      assert.equal(res.headers.get("access-control-allow-origin"), null);
    } finally {
      s.close();
    }
  });
});
