import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type AsignacionRepository } from "../repositories/asignacion.repository.js";
import { type ComercioRepository } from "../repositories/comercio.repository.js";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { type UserRepository } from "../repositories/user.repository.js";
import { authLocals, invoke } from "../testing/http.js";
import { createAsignacionController } from "./asignacion.controller.js";

const ID = "00000000-0000-4000-8000-000000000011";
const ENC = "00000000-0000-4000-8000-000000000012";
const OTHER = "00000000-0000-4000-8000-000000000013";

const COORDINADOR = authLocals("coord-1", "COORDINADOR");
const ENCUESTADOR = authLocals(ENC, "ENCUESTADOR");

interface Repos {
  asignaciones: object;
  relevamientos: object;
  users: object;
  comercios: object;
}

function controller(overrides: Partial<Repos> = {}) {
  const repos: Repos = {
    asignaciones: {},
    relevamientos: { findById: async () => ({ estado: "ABIERTO" }) },
    users: { findById: async () => ({ role: "ENCUESTADOR", estado: "ACTIVO" }) },
    comercios: { findById: async () => ({ estado: "ACTIVO" }) },
    ...overrides,
  };

  return createAsignacionController({
    asignaciones: repos.asignaciones as AsignacionRepository,
    relevamientos: repos.relevamientos as RelevamientoRepository,
    users: repos.users as UserRepository,
    comercios: repos.comercios as ComercioRepository,
  });
}

describe("asignacion controller", () => {
  describe("create", () => {
    const body = { relevamiento: ID, encuestador: ENC, comercio: ID };

    it("creates a PENDIENTE asignacion", async () => {
      let received: unknown;
      const c = controller({
        asignaciones: {
          create: async (data: object) => {
            received = data;
            return data;
          },
        },
      });

      const res = await invoke(c.create, { body: { ...body, estado: "COMPLETADA" } }, COORDINADOR);

      assert.equal(res.statusCode, 201);
      assert.deepEqual(received, { relevamiento: ID, encuestador: ENC, comercio: ID, estado: "PENDIENTE" });
    });

    it("answers 404 for a missing relevamiento and 409 for a CERRADO one", async () => {
      const missing = controller({ relevamientos: { findById: async () => null } });
      const closed = controller({ relevamientos: { findById: async () => ({ estado: "CERRADO" }) } });

      assert.equal((await invoke(missing.create, { body }, COORDINADOR)).statusCode, 404);
      assert.equal((await invoke(closed.create, { body }, COORDINADOR)).statusCode, 409);
    });

    it("answers 404 for a missing encuestador and 400 for one that is not an ACTIVO ENCUESTADOR", async () => {
      const missing = controller({ users: { findById: async () => null } });
      const analista = controller({ users: { findById: async () => ({ role: "ANALISTA", estado: "ACTIVO" }) } });
      const inactive = controller({
        users: { findById: async () => ({ role: "ENCUESTADOR", estado: "INACTIVO" }) },
      });

      assert.equal((await invoke(missing.create, { body }, COORDINADOR)).statusCode, 404);
      assert.equal((await invoke(analista.create, { body }, COORDINADOR)).statusCode, 400);
      assert.equal((await invoke(inactive.create, { body }, COORDINADOR)).statusCode, 400);
    });

    it("answers 404 for a missing comercio and 400 for an INACTIVO one", async () => {
      const missing = controller({ comercios: { findById: async () => null } });
      const inactive = controller({ comercios: { findById: async () => ({ estado: "INACTIVO" }) } });

      assert.equal((await invoke(missing.create, { body }, COORDINADOR)).statusCode, 404);
      assert.equal((await invoke(inactive.create, { body }, COORDINADOR)).statusCode, 400);
    });

    it("answers 409 when the comercio is already assigned in the relevamiento", async () => {
      const c = controller({
        asignaciones: {
          create: async () => {
            throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
          },
        },
      });

      assert.equal((await invoke(c.create, { body }, COORDINADOR)).statusCode, 409);
    });
  });

  describe("list", () => {
    function listController() {
      const captured: { filter?: unknown } = {};
      const c = controller({
        asignaciones: {
          list: async (f: unknown) => {
            captured.filter = f;
            return [];
          },
        },
      });
      return { c, captured };
    }

    it("answers 400 on invalid filters", async () => {
      const res = await invoke(controller().list, { query: { estado: "X" } }, COORDINADOR);

      assert.equal(res.statusCode, 400);
    });

    it("applies the provided filters", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { relevamiento: ID, estado: "PENDIENTE", junk: "x" } }, COORDINADOR);

      assert.deepEqual(captured.filter, { relevamiento: ID, estado: "PENDIENTE" });
    });

    it("forces the own id for an ENCUESTADOR, ignoring a different one in the query", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { encuestador: OTHER } }, ENCUESTADOR);

      assert.deepEqual(captured.filter, { encuestador: ENC });
    });
  });

  describe("getById", () => {
    it("hides another encuestador's asignacion behind a 404", async () => {
      const c = controller({ asignaciones: { findById: async () => ({ encuestador: OTHER }) } });

      assert.equal((await invoke(c.getById, { params: { id: ID } }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(c.getById, { params: { id: ID } }, COORDINADOR)).statusCode, 200);
    });

    it("answers 400 on an invalid id", async () => {
      const res = await invoke(controller().getById, { params: { id: "x" } }, COORDINADOR);

      assert.equal(res.statusCode, 400);
    });
  });

  describe("setEstado", () => {
    const own = { id: ID, encuestador: ENC, estado: "PENDIENTE", relevamiento: ID };

    it("moves PENDIENTE to EN_CURSO conditioned on the estado it read", async () => {
      let args: unknown[] = [];
      const c = controller({
        asignaciones: {
          findById: async () => own,
          transitionEstado: async (...a: unknown[]) => {
            args = a;
            return { ...own, estado: "EN_CURSO" };
          },
        },
      });

      const res = await invoke(c.setEstado, { params: { id: ID }, body: { estado: "EN_CURSO" } }, ENCUESTADOR);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(args, [ID, "PENDIENTE", "EN_CURSO"]);
    });

    it("answers 409 on a forbidden transition", async () => {
      const c = controller({ asignaciones: { findById: async () => own } });

      const res = await invoke(c.setEstado, { params: { id: ID }, body: { estado: "COMPLETADA" } }, ENCUESTADOR);

      assert.equal(res.statusCode, 409);
    });

    it("answers 409 when the relevamiento is CERRADO", async () => {
      const c = controller({
        asignaciones: { findById: async () => own },
        relevamientos: { findById: async () => ({ estado: "CERRADO" }) },
      });

      const res = await invoke(c.setEstado, { params: { id: ID }, body: { estado: "EN_CURSO" } }, ENCUESTADOR);

      assert.equal(res.statusCode, 409);
    });

    it("answers 409 when it was modified concurrently", async () => {
      const c = controller({
        asignaciones: { findById: async () => own, transitionEstado: async () => null },
      });

      const res = await invoke(c.setEstado, { params: { id: ID }, body: { estado: "EN_CURSO" } }, ENCUESTADOR);

      assert.equal(res.statusCode, 409);
    });

    it("answers 404 for another encuestador's asignacion", async () => {
      const c = controller({ asignaciones: { findById: async () => ({ ...own, encuestador: OTHER }) } });

      const res = await invoke(c.setEstado, { params: { id: ID }, body: { estado: "EN_CURSO" } }, ENCUESTADOR);

      assert.equal(res.statusCode, 404);
    });
  });

  describe("reassign", () => {
    it("reassigns a PENDIENTE asignacion", async () => {
      let args: unknown[] = [];
      const c = controller({
        asignaciones: {
          reassignIfPendiente: async (...a: unknown[]) => {
            args = a;
            return { id: ID, encuestador: ENC };
          },
        },
      });

      const res = await invoke(c.reassign, { params: { id: ID }, body: { encuestador: ENC } }, COORDINADOR);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(args, [ID, ENC]);
    });

    it("answers 409 when it exists but is not PENDIENTE, and 404 when it does not exist", async () => {
      const notPending = controller({
        asignaciones: { reassignIfPendiente: async () => null, findById: async () => ({ estado: "EN_CURSO" }) },
      });
      const missing = controller({
        asignaciones: { reassignIfPendiente: async () => null, findById: async () => null },
      });

      assert.equal(
        (await invoke(notPending.reassign, { params: { id: ID }, body: { encuestador: ENC } }, COORDINADOR))
          .statusCode,
        409,
      );
      assert.equal(
        (await invoke(missing.reassign, { params: { id: ID }, body: { encuestador: ENC } }, COORDINADOR))
          .statusCode,
        404,
      );
    });

    it("answers 400 when the new encuestador is not an ACTIVO ENCUESTADOR", async () => {
      const c = controller({ users: { findById: async () => ({ role: "SUPERVISOR", estado: "ACTIVO" }) } });

      const res = await invoke(c.reassign, { params: { id: ID }, body: { encuestador: ENC } }, COORDINADOR);

      assert.equal(res.statusCode, 400);
    });
  });
});
