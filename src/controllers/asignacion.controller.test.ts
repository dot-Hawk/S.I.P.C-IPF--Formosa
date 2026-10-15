import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Request, type Response } from "express";
import { createAsignacionController, type AsignacionModels } from "./asignacion.controller.js";

interface FakeResponse {
  statusCode: number;
  body: unknown;
  locals: Record<string, unknown>;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeResponse(auth?: { userId: string; role: string }): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    locals: auth ? { auth } : {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const ID = "507f1f77bcf86cd799439011";
const OTHER_ID = "507f1f77bcf86cd799439012";
const COORDINADOR = { userId: "coord-1", role: "COORDINADOR" };
const ENCUESTADOR = { userId: OTHER_ID, role: "ENCUESTADOR" };

function models(overrides: Partial<Record<keyof AsignacionModels, object>> = {}): AsignacionModels {
  return {
    asignacion: {},
    relevamiento: { findById: async () => ({ estado: "ABIERTO" }) },
    user: { findById: async () => ({ role: "ENCUESTADOR", estado: "ACTIVO" }) },
    comercio: { findById: async () => ({ estado: "ACTIVO" }) },
    ...overrides,
  } as unknown as AsignacionModels;
}

async function call(
  method: "create" | "list" | "getById" | "setEstado" | "reassign",
  m: AsignacionModels,
  req: object,
  auth: { userId: string; role: string } = COORDINADOR,
): Promise<FakeResponse> {
  const res = fakeResponse(auth);
  await createAsignacionController(m)[method](req as Request, res as unknown as Response);
  return res;
}

describe("asignacion controller", () => {
  describe("create", () => {
    const body = { relevamiento: ID, encuestador: OTHER_ID, comercio: ID };

    it("creates a PENDIENTE asignacion", async () => {
      let received: unknown;
      const m = models({
        asignacion: {
          create: async (data: unknown) => {
            received = data;
            return data;
          },
        },
      });

      const res = await call("create", m, { body });

      assert.equal(res.statusCode, 201);
      assert.deepEqual(received, { ...body, estado: "PENDIENTE" });
    });

    it("answers 404 when the relevamiento does not exist", async () => {
      const m = models({ relevamiento: { findById: async () => null } });

      assert.equal((await call("create", m, { body })).statusCode, 404);
    });

    it("answers 409 when the relevamiento is CERRADO", async () => {
      const m = models({ relevamiento: { findById: async () => ({ estado: "CERRADO" }) } });

      assert.equal((await call("create", m, { body })).statusCode, 409);
    });

    it("answers 400 when the user is not an ACTIVO ENCUESTADOR", async () => {
      for (const user of [
        { role: "ANALISTA", estado: "ACTIVO" },
        { role: "ENCUESTADOR", estado: "LICENCIA" },
      ]) {
        const m = models({ user: { findById: async () => user } });

        assert.equal((await call("create", m, { body })).statusCode, 400);
      }
    });

    it("answers 404 when the encuestador does not exist", async () => {
      const m = models({ user: { findById: async () => null } });

      assert.equal((await call("create", m, { body })).statusCode, 404);
    });

    it("answers 404 for a missing comercio and 400 for an INACTIVO one", async () => {
      const missing = models({ comercio: { findById: async () => null } });
      const inactive = models({ comercio: { findById: async () => ({ estado: "INACTIVO" }) } });

      assert.equal((await call("create", missing, { body })).statusCode, 404);
      assert.equal((await call("create", inactive, { body })).statusCode, 400);
    });

    it("answers 409 when the comercio is already assigned in the relevamiento", async () => {
      const m = models({
        asignacion: {
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
      const captured: { filter?: unknown } = {};
      const m = models({
        asignacion: {
          find: (filter: unknown) => {
            captured.filter = filter;
            return { sort: async () => [] };
          },
        },
      });
      return { m, captured };
    }

    it("answers 400 on invalid filters", async () => {
      const res = await call("list", models(), { query: { relevamiento: "x" } });

      assert.equal(res.statusCode, 400);
    });

    it("applies the provided filters for a COORDINADOR", async () => {
      const { m, captured } = listModels();

      await call("list", m, { query: { relevamiento: ID, estado: "PENDIENTE" } });

      assert.deepEqual(captured.filter, { relevamiento: ID, estado: "PENDIENTE" });
    });

    it("forces the own id for an ENCUESTADOR, overriding any encuestador filter", async () => {
      const { m, captured } = listModels();

      await call("list", m, { query: { encuestador: ID } }, ENCUESTADOR);

      assert.deepEqual(captured.filter, { encuestador: ENCUESTADOR.userId });
    });
  });

  describe("getById", () => {
    const found = { encuestador: OTHER_ID, estado: "PENDIENTE" };

    it("answers 400 on an invalid id and 404 when missing", async () => {
      assert.equal((await call("getById", models(), { params: { id: "x" } })).statusCode, 400);

      const m = models({ asignacion: { findById: async () => null } });
      assert.equal((await call("getById", m, { params: { id: ID } })).statusCode, 404);
    });

    it("lets an ENCUESTADOR read their own asignacion", async () => {
      const m = models({ asignacion: { findById: async () => found } });

      assert.equal((await call("getById", m, { params: { id: ID } }, ENCUESTADOR)).statusCode, 200);
    });

    it("hides another encuestador's asignacion behind a 404", async () => {
      const m = models({ asignacion: { findById: async () => ({ ...found, encuestador: ID }) } });

      assert.equal((await call("getById", m, { params: { id: ID } }, ENCUESTADOR)).statusCode, 404);
    });
  });

  describe("setEstado", () => {
    function setEstadoModels(current: string, updateResult: object | null = { estado: "EN_CURSO" }) {
      const captured: { filter?: unknown; update?: unknown } = {};
      const m = models({
        asignacion: {
          findById: async () => ({ encuestador: OTHER_ID, relevamiento: ID, estado: current }),
          findOneAndUpdate: async (filter: unknown, update: unknown) => {
            captured.filter = filter;
            captured.update = update;
            return updateResult;
          },
        },
      });
      return { m, captured };
    }

    it("applies a valid transition conditional on the current estado", async () => {
      const { m, captured } = setEstadoModels("PENDIENTE");

      const res = await call("setEstado", m, { params: { id: ID }, body: { estado: "EN_CURSO" } });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(captured.filter, { _id: ID, estado: "PENDIENTE" });
      assert.deepEqual(captured.update, { estado: "EN_CURSO" });
    });

    it("answers 409 on an invalid transition", async () => {
      const { m } = setEstadoModels("PENDIENTE");

      const res = await call("setEstado", m, { params: { id: ID }, body: { estado: "COMPLETADA" } });

      assert.equal(res.statusCode, 409);
    });

    it("answers 409 when the relevamiento is no longer ABIERTO", async () => {
      const { m } = setEstadoModels("PENDIENTE");
      const closed = { ...m, relevamiento: { findById: async () => ({ estado: "CERRADO" }) } } as unknown as AsignacionModels;

      const res = await call("setEstado", closed, { params: { id: ID }, body: { estado: "EN_CURSO" } });

      assert.equal(res.statusCode, 409);
    });

    it("answers 409 when a concurrent change wins the race", async () => {
      const { m } = setEstadoModels("PENDIENTE", null);

      const res = await call("setEstado", m, { params: { id: ID }, body: { estado: "EN_CURSO" } });

      assert.equal(res.statusCode, 409);
    });

    it("lets the assigned ENCUESTADOR advance it but not someone else's", async () => {
      const { m } = setEstadoModels("PENDIENTE");
      const own = await call("setEstado", m, { params: { id: ID }, body: { estado: "EN_CURSO" } }, ENCUESTADOR);
      const foreign = await call(
        "setEstado",
        m,
        { params: { id: ID }, body: { estado: "EN_CURSO" } },
        { userId: ID, role: "ENCUESTADOR" },
      );

      assert.equal(own.statusCode, 200);
      assert.equal(foreign.statusCode, 404);
    });
  });

  describe("reassign", () => {
    it("reassigns only a PENDIENTE asignacion, atomically", async () => {
      let filter: unknown;
      let update: unknown;
      const m = models({
        asignacion: {
          findOneAndUpdate: async (f: unknown, u: unknown) => {
            filter = f;
            update = u;
            return { encuestador: OTHER_ID };
          },
        },
      });

      const res = await call("reassign", m, { params: { id: ID }, body: { encuestador: OTHER_ID } });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(filter, { _id: ID, estado: "PENDIENTE" });
      assert.deepEqual(update, { encuestador: OTHER_ID });
    });

    it("answers 409 when it exists but is not PENDIENTE, 404 when it does not exist", async () => {
      const notPending = models({
        asignacion: { findOneAndUpdate: async () => null, exists: async () => ({ _id: ID }) },
      });
      const missing = models({
        asignacion: { findOneAndUpdate: async () => null, exists: async () => null },
      });
      const req = { params: { id: ID }, body: { encuestador: OTHER_ID } };

      assert.equal((await call("reassign", notPending, req)).statusCode, 409);
      assert.equal((await call("reassign", missing, req)).statusCode, 404);
    });

    it("answers 400 when the new user is not an ACTIVO ENCUESTADOR", async () => {
      const m = models({ user: { findById: async () => ({ role: "SUPERVISOR", estado: "ACTIVO" }) } });

      const res = await call("reassign", m, { params: { id: ID }, body: { encuestador: OTHER_ID } });

      assert.equal(res.statusCode, 400);
    });
  });
});
