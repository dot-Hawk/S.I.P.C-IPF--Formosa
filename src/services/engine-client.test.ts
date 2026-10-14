import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { createHttpEngineClient, EngineError, type EngineRequest } from "./engine-client.js";

const REQUEST: EngineRequest = {
  mesBase: "2026-01",
  mesObjetivo: "2026-02",
  observaciones: [],
  variedades: [],
  parametros: { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true },
};

const OK_BODY = {
  version: "0.1.0",
  meses: ["2026-01", "2026-02"],
  relativos: [],
  imputaciones: [],
  sinImputar: [],
  especiales: [],
  resumen: { observaciones: 0, variedades: 0, informantes: 0, imputaciones: 0, sinImputar: 0 },
};

describe("http engine client", () => {
  let server: Server;
  let baseUrl: string;
  let handler: (req: IncomingMessage, res: ServerResponse, body: string) => void;

  before(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => handler(req, res, body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
  });

  const client = (overrides: { timeoutMs?: number; baseUrl?: string } = {}) =>
    createHttpEngineClient({ baseUrl: overrides.baseUrl ?? baseUrl, apiKey: "secret", timeoutMs: overrides.timeoutMs ?? 2000 });

  it("posts the request with the api key and returns the parsed body", async () => {
    let seen: { url?: string | undefined; key?: string | string[] | undefined; body?: unknown } = {};
    handler = (req, res, body) => {
      seen = { url: req.url, key: req.headers["x-api-key"], body: JSON.parse(body) };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(OK_BODY));
    };

    const result = await client().calcular(REQUEST);

    assert.equal(seen.url, "/v1/calculo");
    assert.equal(seen.key, "secret");
    assert.deepEqual(seen.body, REQUEST);
    assert.equal(result.version, "0.1.0");
  });

  it("turns a 422 into a rejection that carries the reason", async () => {
    handler = (_req, res) => {
      res.writeHead(422, { "content-type": "application/json" }).end(JSON.stringify({ detail: "no hay precios para el mes 2026-02" }));
    };

    await assert.rejects(client().calcular(REQUEST), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "rejected");
      assert.match(error.message, /2026-02/);
      return true;
    });
  });

  it("reports other statuses as the engine being unavailable", async () => {
    handler = (_req, res) => {
      res.writeHead(500).end("boom");
    };

    await assert.rejects(client().calcular(REQUEST), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "unavailable");
      return true;
    });
  });

  it("reports an unreachable engine as unavailable", async () => {
    await assert.rejects(client({ baseUrl: "http://127.0.0.1:1" }).calcular(REQUEST), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "unavailable");
      return true;
    });
  });

  it("gives up after the timeout", async () => {
    handler = () => {
      // never answers
    };

    await assert.rejects(client({ timeoutMs: 100 }).calcular(REQUEST), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "unavailable");
      return true;
    });
  });

  it("does not trust a malformed answer", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ hello: "world" }));
    };

    await assert.rejects(client().calcular(REQUEST), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "unavailable");
      return true;
    });
  });
});
