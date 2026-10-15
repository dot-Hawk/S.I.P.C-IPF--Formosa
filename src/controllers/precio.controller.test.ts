import { describe, it, mock } from "node:test";
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
    auditoria: { create: async () => ({}) },
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

    it("stores oferta, false by default", async () => {
      const received: Record<string, unknown>[] = [];
      const m = models({
        precio: {
          create: async (data: Record<string, unknown>) => {
            received.push(data);
            return data;
          },
        },
      });

      await call("create", m, { body });
      await call("create", m, { body: { ...body, oferta: true } });

      assert.equal(received[0]?.["oferta"], false);
      assert.equal(received[1]?.["oferta"], true);
    });

    it("records a CREACION audit entry with the author and the stored values", async () => {
      const entries: unknown[] = [];
      const created = {
        _id: ID,
        relevamiento: ID,
        comercio: ID,
        producto: ID,
        valor: 1500,
        oferta: true,
        observacion: "oferta",
        fechaRelevamiento: FECHA_INICIO,
      };
      const m = models({
        precio: { create: async () => created },
        auditoria: {
          create: async (entry: unknown) => {
            entries.push(entry);
            return entry;
          },
        },
      });

      await call("create", m, { body: { ...body, oferta: true } });

      assert.deepEqual(entries, [
        {
          precio: ID,
          relevamiento: ID,
          comercio: ID,
          producto: ID,
          accion: "CREACION",
          usuario: ME,
          rol: "ENCUESTADOR",
          anterior: null,
          posterior: { valor: 1500, oferta: true, observacion: "oferta", fechaRelevamiento: FECHA_INICIO },
        },
      ]);
    });

    it("still answers 201 when the audit entry cannot be written", async () => {
      const logged = mock.method(console, "error", () => {});
      const m = models({
        precio: { create: async (data: object) => data },
        auditoria: {
          create: async () => {
            throw new Error("db down");
          },
        },
      });

      const res = await call("create", m, { body });

      assert.equal(res.statusCode, 201);
      assert.equal(logged.mock.callCount(), 1);
      logged.mock.restore();
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

    it("filters by oferta as a boolean", async () => {
      const { m, captured } = listModels();

      await call("list", m, { query: { oferta: "true" } }, ANALISTA);
      assert.deepEqual(captured.filter, { oferta: true });

      await call("list", m, { query: { oferta: "false" } }, ANALISTA);
      assert.deepEqual(captured.filter, { oferta: false });
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

    it("lets the owner switch oferta", async () => {
      let update: unknown;
      const m = models({
        precio: {
          findById: async () => precio,
          findOneAndUpdate: async (_f: unknown, u: unknown) => {
            update = u;
            return { ...precio, oferta: true };
          },
        },
      });

      await call("update", m, { params: { id: ID }, body: { oferta: true } });

      assert.deepEqual(update, { $set: { oferta: true } });
    });

    it("records a MODIFICACION entry with the previous and the new values", async () => {
      const entries: unknown[] = [];
      const before = { ...precio, valor: 100, oferta: false, observacion: "viejo", fechaRelevamiento: FECHA_INICIO };
      const m = models({
        precio: {
          findById: async () => before,
          findOneAndUpdate: async () => ({ ...before, valor: 99, observacion: "nuevo" }),
        },
        auditoria: {
          create: async (entry: unknown) => {
            entries.push(entry);
            return entry;
          },
        },
      });

      await call("update", m, { params: { id: ID }, body: { valor: 99, observacion: "nuevo" } });

      assert.deepEqual(entries, [
        {
          precio: ID,
          relevamiento: ID,
          comercio: ID,
          producto: undefined,
          accion: "MODIFICACION",
          usuario: ME,
          rol: "ENCUESTADOR",
          anterior: { valor: 100, oferta: false, observacion: "viejo", fechaRelevamiento: FECHA_INICIO },
          posterior: { valor: 99, oferta: false, observacion: "nuevo", fechaRelevamiento: FECHA_INICIO },
        },
      ]);
    });

    it("records a ELIMINACION entry that keeps the deleted values", async () => {
      const entries: unknown[] = [];
      const before = { ...precio, valor: 100, observacion: "x", fechaRelevamiento: FECHA_INICIO };
      const m = models({
        precio: { findById: async () => before, deleteOne: async () => ({}) },
        auditoria: {
          create: async (entry: unknown) => {
            entries.push(entry);
            return entry;
          },
        },
      });

      await call("remove", m, { params: { id: ID } });

      const entry = entries[0] as Record<string, unknown>;
      assert.equal(entry["accion"], "ELIMINACION");
      assert.deepEqual(entry["anterior"], {
        valor: 100,
        oferta: false,
        observacion: "x",
        fechaRelevamiento: FECHA_INICIO,
      });
      assert.equal(entry["posterior"], null);
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

    describe("supervisor correction", () => {
      const SUPERVISOR: Auth = { userId: "sup-1", role: "SUPERVISOR" };
      const other = { ...precio, encuestador: ID };

      it("audits the supervisor as the author of the correction", async () => {
        const entries: Record<string, unknown>[] = [];
        const m = models({
          precio: { findById: async () => other, findOneAndUpdate: async () => ({ ...other, valor: 50 }) },
          auditoria: {
            create: async (entry: Record<string, unknown>) => {
              entries.push(entry);
              return entry;
            },
          },
        });

        await call("update", m, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(entries[0]?.["usuario"], "sup-1");
        assert.equal(entries[0]?.["rol"], "SUPERVISOR");
      });

      it("lets a supervisor correct another surveyor's precio even after the asignacion is COMPLETADA", async () => {
        let update: unknown;
        const m = models({
          precio: {
            findById: async () => other,
            findOneAndUpdate: async (_f: unknown, u: unknown) => {
              update = u;
              return { valor: 50 };
            },
          },
          asignacion: { exists: async () => null },
        });

        const res = await call("update", m, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(update, { $set: { valor: 50 } });
      });

      it("still answers 409 once the relevamiento is CERRADO", async () => {
        const m = models({
          precio: { findById: async () => other },
          relevamiento: { findById: async () => ({ estado: "CERRADO" }) },
        });

        const res = await call("update", m, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(res.statusCode, 409);
      });

      it("answers 404 for an unknown precio", async () => {
        const m = models({ precio: { findById: async () => null } });

        const res = await call("update", m, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(res.statusCode, 404);
      });

      it("cannot delete: removal stays with the owner", async () => {
        const m = models({ precio: { findById: async () => other } });

        const res = await call("remove", m, { params: { id: ID } }, SUPERVISOR);

        assert.equal(res.statusCode, 404);
      });
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
