import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Request, type Response } from "express";
import { createPrecioController, type PrecioModels } from "./precio.controller.js";

interface FakeResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
  locals: Record<string, unknown>;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
  end(): FakeResponse;
}

type Auth = { userId: string; role: string };

function fakeResponse(auth: Auth): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    ended: false,
    locals: { auth },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

const ID = "507f1f77bcf86cd799439011";
const ME = "507f1f77bcf86cd799439012";
const ENCUESTADOR: Auth = { userId: ME, role: "ENCUESTADOR" };
const ANALISTA: Auth = { userId: "an-1", role: "ANALISTA" };
const FECHA_INICIO = new Date("2026-10-01T00:00:00Z");

function models(overrides: Partial<Record<keyof PrecioModels, object>> = {}): PrecioModels {
  return {
    precio: {},
    relevamiento: { findById: async () => ({ estado: "ABIERTO", fechaInicio: FECHA_INICIO }) },
    asignacion: { exists: async () => ({ _id: "a" }) },
    producto: { findById: async () => ({ estado: "ACTIVO" }) },
    ...overrides,
  } as unknown as PrecioModels;
}

async function call(
  method: "create" | "list" | "getById" | "update" | "remove",
  m: PrecioModels,
  req: object,
  auth: Auth = ENCUESTADOR,
): Promise<FakeResponse> {
  const res = fakeResponse(auth);
  await createPrecioController(m)[method](req as Request, res as unknown as Response);
  return res;
}

describe("precio controller", () => {
  describe("create", () => {
    const body = { relevamiento: ID, comercio: ID, producto: ID, valor: 1500, observacion: " oferta " };

    it("takes the encuestador from the token and ignores one in the body", async () => {
      let received: Record<string, unknown> | undefined;
      const m = models({
        precio: {
          create: async (data: Record<string, unknown>) => {
            received = data;
            return data;
          },
        },
      });

      const res = await call("create", m, { body: { ...body, encuestador: "someone-else" } });

      assert.equal(res.statusCode, 201);
      assert.equal(received?.["encuestador"], ME);
      assert.equal(received?.["observacion"], "oferta");
      assert.ok(received?.["fechaRelevamiento"] instanceof Date);
    });

    it("answers 404 for a missing relevamiento and 409 for a CERRADO one", async () => {
      const missing = models({ relevamiento: { findById: async () => null } });
      const closed = models({ relevamiento: { findById: async () => ({ estado: "CERRADO" }) } });

      assert.equal((await call("create", missing, { body })).statusCode, 404);
      assert.equal((await call("create", closed, { body })).statusCode, 409);
    });

    it("answers 403 without an EN_CURSO asignacion for the comercio, checking the right keys", async () => {
      let filter: unknown;
      const m = models({
        asignacion: {
          exists: async (f: unknown) => {
            filter = f;
            return null;
          },
        },
      });

      const res = await call("create", m, { body });

      assert.equal(res.statusCode, 403);
      assert.deepEqual(filter, { relevamiento: ID, comercio: ID, encuestador: ME, estado: "EN_CURSO" });
    });

    it("answers 404 for a missing producto and 400 for an INACTIVO one", async () => {
      const missing = models({ producto: { findById: async () => null } });
      const inactive = models({ producto: { findById: async () => ({ estado: "INACTIVO" }) } });

      assert.equal((await call("create", missing, { body })).statusCode, 404);
      assert.equal((await call("create", inactive, { body })).statusCode, 400);
    });

    it("answers 400 when fechaRelevamiento is before the relevamiento start", async () => {
      const res = await call("create", models(), { body: { ...body, fechaRelevamiento: "2026-09-30" } });

      assert.equal(res.statusCode, 400);
    });

    it("answers 409 on a duplicate precio", async () => {
      const m = models({
        precio: {
          create: async () => {
            throw Object.assign(new Error("duplicate"), { code: 11000 });
          },
        },
      });

      assert.equal((await call("create", m, { body })).statusCode, 409);
    });
  });

  describe("list", () => {
    function listModels() {
      const captured: { filter?: unknown; skip?: number; limit?: number } = {};
      const query = {
        sort: () => query,
        skip: (n: number) => {
          captured.skip = n;
          return query;
        },
        limit: async (n: number) => {
          captured.limit = n;
          return [];
        },
      };
      const m = models({
        precio: {
          find: (filter: unknown) => {
            captured.filter = filter;
            return query;
          },
        },
      });
      return { m, captured };
    }

    it("answers 400 on invalid filters or pagination", async () => {
      assert.equal((await call("list", models(), { query: { limit: "9999" } }, ANALISTA)).statusCode, 400);
    });

    it("applies filters and default pagination for a non-encuestador", async () => {
      const { m, captured } = listModels();

      await call("list", m, { query: { relevamiento: ID } }, ANALISTA);

      assert.deepEqual(captured.filter, { relevamiento: ID });
      assert.equal(captured.skip, 0);
      assert.equal(captured.limit, 50);
    });

    it("computes skip from page and limit", async () => {
      const { m, captured } = listModels();

      await call("list", m, { query: { page: "3", limit: "20" } }, ANALISTA);

      assert.equal(captured.skip, 40);
      assert.equal(captured.limit, 20);
    });

    it("forces the own id for an ENCUESTADOR", async () => {
      const { m, captured } = listModels();

      await call("list", m, { query: { encuestador: ID } }, ENCUESTADOR);

      assert.deepEqual(captured.filter, { encuestador: ME });
    });
  });

  describe("getById", () => {
    it("hides another encuestador's precio behind a 404 but lets an ANALISTA read it", async () => {
      const m = models({ precio: { findById: async () => ({ encuestador: ID }) } });

      assert.equal((await call("getById", m, { params: { id: ID } }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await call("getById", m, { params: { id: ID } }, ANALISTA)).statusCode, 200);
    });
  });

  describe("update and remove", () => {
    const precio = { _id: ID, encuestador: ME, relevamiento: ID, comercio: ID };

    it("updates only valor and observacion for the owner", async () => {
      let update: unknown;
      const m = models({
        precio: {
          findById: async () => precio,
          findOneAndUpdate: async (_f: unknown, u: unknown) => {
            update = u;
            return { valor: 99 };
          },
        },
      });

      const res = await call("update", m, {
        params: { id: ID },
        body: { valor: 99, observacion: " ok ", producto: "hack", encuestador: "hack" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(update, { $set: { valor: 99, observacion: "ok" } });
    });

    it("answers 404 when the precio belongs to someone else", async () => {
      const m = models({ precio: { findById: async () => ({ ...precio, encuestador: ID }) } });

      assert.equal((await call("update", m, { params: { id: ID }, body: { valor: 1 } })).statusCode, 404);
      assert.equal((await call("remove", m, { params: { id: ID } })).statusCode, 404);
    });

    it("answers 409 when the relevamiento is CERRADO or the asignacion is no longer EN_CURSO", async () => {
      const closed = models({
        precio: { findById: async () => precio },
        relevamiento: { findById: async () => ({ estado: "CERRADO" }) },
      });
      const completed = models({
        precio: { findById: async () => precio },
        asignacion: { exists: async () => null },
      });

      assert.equal((await call("update", closed, { params: { id: ID }, body: { valor: 1 } })).statusCode, 409);
      assert.equal((await call("remove", completed, { params: { id: ID } })).statusCode, 409);
    });

    it("deletes with 204 for the owner", async () => {
      let deleted: unknown;
      const m = models({
        precio: {
          findById: async () => precio,
          deleteOne: async (f: unknown) => {
            deleted = f;
          },
        },
      });

      const res = await call("remove", m, { params: { id: ID } });

      assert.equal(res.statusCode, 204);
      assert.equal(res.ended, true);
      assert.deepEqual(deleted, { _id: ID });
    });
  });
});
