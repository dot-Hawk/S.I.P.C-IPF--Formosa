import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type CalculoRepository } from "../repositories/calculo.repository.js";
import { CalculoError, type createCalculoService } from "../services/calculo.service.js";
import { authLocals, invoke } from "../testing/http.js";
import { createCalculoController } from "./calculo.controller.js";

const ID = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000012";
const ANALISTA = authLocals(ME, "ANALISTA");

function controller(options: { service?: object; calculos?: object } = {}) {
  return createCalculoController(
    (options.service ?? {}) as ReturnType<typeof createCalculoService>,
    (options.calculos ?? {}) as CalculoRepository,
  );
}

describe("calculo controller", () => {
  describe("create", () => {
    it("runs the calculation as the authenticated user and answers 201", async () => {
      let args: unknown[] = [];
      const service = {
        ejecutar: async (...a: unknown[]) => {
          args = a;
          return { id: ID, estado: "COMPLETADO" };
        },
      };

      const res = await invoke(
        controller({ service }).create,
        { body: { mesBase: "2026-01", mesObjetivo: "2026-03" } },
        ANALISTA,
      );

      assert.equal(res.statusCode, 201);
      assert.deepEqual(args, [{ mesBase: "2026-01", mesObjetivo: "2026-03" }, { userId: ME }]);
    });

    it("maps the service errors to their status", async () => {
      for (const status of [409, 422, 502] as const) {
        const service = {
          ejecutar: async () => {
            throw new CalculoError(status, "reason");
          },
        };

        const res = await invoke(controller({ service }).create, { body: {} }, ANALISTA);

        assert.equal(res.statusCode, status);
        assert.deepEqual(res.body, { message: "reason" });
      }
    });

    it("rethrows unexpected errors", async () => {
      const service = {
        ejecutar: async () => {
          throw new Error("connection lost");
        },
      };

      await assert.rejects(invoke(controller({ service }).create, { body: {} }, ANALISTA), /connection lost/);
    });
  });

  describe("list", () => {
    it("paginates", async () => {
      let page: unknown;
      const calculos = {
        list: async (p: unknown) => {
          page = p;
          return [];
        },
      };

      await invoke(controller({ calculos }).list, { query: { page: "2", limit: "10" } }, ANALISTA);

      assert.deepEqual(page, { limit: 10, offset: 10 });
    });

    it("answers 400 on bad pagination", async () => {
      const res = await invoke(controller().list, { query: { limit: "9999" } }, ANALISTA);

      assert.equal(res.statusCode, 400);
    });
  });

  describe("getById", () => {
    it("answers 400, 404 and 200 appropriately", async () => {
      const found = controller({ calculos: { findById: async () => ({ id: ID }) } });
      const missing = controller({ calculos: { findById: async () => null } });

      assert.equal((await invoke(found.getById, { params: { id: "x" } }, ANALISTA)).statusCode, 400);
      assert.equal((await invoke(missing.getById, { params: { id: ID } }, ANALISTA)).statusCode, 404);
      assert.equal((await invoke(found.getById, { params: { id: ID } }, ANALISTA)).statusCode, 200);
    });
  });

  describe("relativos", () => {
    it("filters by variedad and month", async () => {
      let args: unknown[] = [];
      const calculos = {
        findById: async () => ({ id: ID }),
        relativos: async (...a: unknown[]) => {
          args = a;
          return [];
        },
      };

      await invoke(
        controller({ calculos }).relativos,
        { params: { id: ID }, query: { variedad: "1111101", mes: "2026-02" } },
        ANALISTA,
      );

      assert.deepEqual(args, [ID, { variedad: "1111101", mes: "2026-02" }]);
    });

    it("answers 400 on invalid filters and 404 for an unknown run", async () => {
      const bad = await invoke(controller().relativos, { params: { id: ID }, query: { mes: "x" } }, ANALISTA);
      const missing = await invoke(
        controller({ calculos: { findById: async () => null } }).relativos,
        { params: { id: ID }, query: {} },
        ANALISTA,
      );

      assert.equal(bad.statusCode, 400);
      assert.equal(missing.statusCode, 404);
    });
  });
});
