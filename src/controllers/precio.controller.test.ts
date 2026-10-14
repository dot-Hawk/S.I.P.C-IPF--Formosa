import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type AsignacionRepository } from "../repositories/asignacion.repository.js";
import { type PrecioRepository } from "../repositories/precio.repository.js";
import { type ProductoRepository } from "../repositories/producto.repository.js";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { authLocals, invoke } from "../testing/http.js";
import { createPrecioController } from "./precio.controller.js";

const ID = "00000000-0000-4000-8000-000000000011";
const ME = "00000000-0000-4000-8000-000000000012";
const OTHER = "00000000-0000-4000-8000-000000000013";
const ENCUESTADOR = authLocals(ME, "ENCUESTADOR");
const ANALISTA = authLocals("an-1", "ANALISTA");
const SUPERVISOR = authLocals("sup-1", "SUPERVISOR");
const FECHA_INICIO = new Date("2026-10-01T00:00:00Z");

interface Repos {
  precios: object;
  relevamientos: object;
  asignaciones: object;
  productos: object;
}

function controller(overrides: Partial<Repos> = {}) {
  const repos: Repos = {
    relevamientos: { findById: async () => ({ estado: "ABIERTO", fechaInicio: FECHA_INICIO }) },
    asignaciones: { hasEnCurso: async () => true },
    productos: { findById: async () => ({ estado: "ACTIVO" }) },
    ...overrides,
    // Without history nothing is judged, unless a test provides one.
    precios: { historial: async () => [], ...overrides.precios },
  };

  return createPrecioController({
    precios: repos.precios as PrecioRepository,
    relevamientos: repos.relevamientos as RelevamientoRepository,
    asignaciones: repos.asignaciones as AsignacionRepository,
    productos: repos.productos as ProductoRepository,
  });
}

const precio = { id: ID, encuestador: ME, relevamiento: ID, comercio: ID };

describe("precio controller", () => {
  describe("create", () => {
    const body = { relevamiento: ID, comercio: ID, producto: ID, valor: 1500, observacion: " oferta " };

    it("takes the encuestador from the token, ignores one in the body and passes the actor", async () => {
      let received: Record<string, unknown> | undefined;
      let actor: unknown;
      const c = controller({
        precios: {
          create: async (data: Record<string, unknown>, a: unknown) => {
            received = data;
            actor = a;
            return data;
          },
        },
      });

      const res = await invoke(c.create, { body: { ...body, encuestador: OTHER } }, ENCUESTADOR);

      assert.equal(res.statusCode, 201);
      assert.equal(received?.["encuestador"], ME);
      assert.equal(received?.["observacion"], "oferta");
      assert.ok(received?.["fechaRelevamiento"] instanceof Date);
      assert.deepEqual(actor, { userId: ME, role: "ENCUESTADOR" });
    });

    it("stores oferta, false by default", async () => {
      const received: Record<string, unknown>[] = [];
      const c = controller({
        precios: {
          create: async (data: Record<string, unknown>) => {
            received.push(data);
            return data;
          },
        },
      });

      await invoke(c.create, { body }, ENCUESTADOR);
      await invoke(c.create, { body: { ...body, oferta: true } }, ENCUESTADOR);

      assert.equal(received[0]?.["oferta"], false);
      assert.equal(received[1]?.["oferta"], true);
    });

    describe("deviation warning", () => {
      const history = [100, 104, 98, 102, 101];
      const withHistory = (extra: object = {}) =>
        controller({ precios: { historial: async () => history, create: async (d: object) => d, ...extra } });

      it("asks for confirmation when the price is far from its history, and does not save it", async () => {
        let created = false;
        const c = withHistory({
          create: async () => {
            created = true;
          },
        });

        const res = await invoke(c.create, { body: { ...body, valor: 500 } }, ENCUESTADOR);

        assert.equal(res.statusCode, 409);
        const payload = res.body as { requiereConfirmacion: boolean; alerta: { media: number; n: number } };
        assert.equal(payload.requiereConfirmacion, true);
        assert.equal(payload.alerta.n, 5);
        assert.ok(Math.abs(payload.alerta.media - 101) < 1e-9);
        assert.equal(created, false);
      });

      it("saves it, with the alert, once the surveyor confirms", async () => {
        let received: Record<string, unknown> | undefined;
        const c = withHistory({
          create: async (data: Record<string, unknown>) => {
            received = data;
            return data;
          },
        });

        const res = await invoke(c.create, { body: { ...body, valor: 500, confirmarDesvio: true } }, ENCUESTADOR);

        assert.equal(res.statusCode, 201);
        assert.ok(received?.["alerta"]);
      });

      it("saves a usual price without an alert", async () => {
        let received: Record<string, unknown> | undefined;
        const c = withHistory({
          create: async (data: Record<string, unknown>) => {
            received = data;
            return data;
          },
        });

        const res = await invoke(c.create, { body: { ...body, valor: 103 } }, ENCUESTADOR);

        assert.equal(res.statusCode, 201);
        assert.equal(received?.["alerta"], null);
      });

      it("does not judge a promotional price", async () => {
        const res = await invoke(withHistory().create, { body: { ...body, valor: 500, oferta: true } }, ENCUESTADOR);

        assert.equal(res.statusCode, 201);
      });

      it("looks at the history of the same producto and commerce before this relevamiento", async () => {
        let args: unknown[] = [];
        const c = controller({
          precios: {
            historial: async (...a: unknown[]) => {
              args = a;
              return [];
            },
            create: async (d: object) => d,
          },
        });

        await invoke(c.create, { body }, ENCUESTADOR);

        assert.deepEqual(args, [ID, ID, FECHA_INICIO]);
      });
    });

    it("answers 404 for a missing relevamiento and 409 for a CERRADO one", async () => {
      const missing = controller({ relevamientos: { findById: async () => null } });
      const closed = controller({ relevamientos: { findById: async () => ({ estado: "CERRADO" }) } });

      assert.equal((await invoke(missing.create, { body }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(closed.create, { body }, ENCUESTADOR)).statusCode, 409);
    });

    it("answers 403 without an EN_CURSO asignacion for the comercio, checking the right keys", async () => {
      let args: unknown[] = [];
      const c = controller({
        asignaciones: {
          hasEnCurso: async (...a: unknown[]) => {
            args = a;
            return false;
          },
        },
      });

      const res = await invoke(c.create, { body }, ENCUESTADOR);

      assert.equal(res.statusCode, 403);
      assert.deepEqual(args, [ID, ID, ME]);
    });

    it("answers 404 for a missing producto and 400 for an INACTIVO one", async () => {
      const missing = controller({ productos: { findById: async () => null } });
      const inactive = controller({ productos: { findById: async () => ({ estado: "INACTIVO" }) } });

      assert.equal((await invoke(missing.create, { body }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(inactive.create, { body }, ENCUESTADOR)).statusCode, 400);
    });

    it("answers 400 when fechaRelevamiento is before the relevamiento start", async () => {
      const res = await invoke(
        controller().create,
        { body: { ...body, fechaRelevamiento: "2026-09-30" } },
        ENCUESTADOR,
      );

      assert.equal(res.statusCode, 400);
    });

    it("answers 409 on a duplicate precio", async () => {
      const c = controller({
        precios: {
          create: async () => {
            throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
          },
        },
      });

      assert.equal((await invoke(c.create, { body }, ENCUESTADOR)).statusCode, 409);
    });
  });

  describe("list", () => {
    function listController() {
      const captured: { filter?: unknown; page?: unknown } = {};
      const c = controller({
        precios: {
          list: async (filter: unknown, page: unknown) => {
            captured.filter = filter;
            captured.page = page;
            return [];
          },
        },
      });
      return { c, captured };
    }

    it("answers 400 on invalid filters or pagination", async () => {
      const res = await invoke(controller().list, { query: { limit: "9999" } }, ANALISTA);

      assert.equal(res.statusCode, 400);
    });

    it("applies filters and default pagination for a non-encuestador", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { relevamiento: ID } }, ANALISTA);

      assert.deepEqual(captured.filter, { relevamiento: ID });
      assert.deepEqual(captured.page, { limit: 50, offset: 0 });
    });

    it("computes the offset from page and limit", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { page: "3", limit: "20" } }, ANALISTA);

      assert.deepEqual(captured.page, { limit: 20, offset: 40 });
    });

    it("lists only the confirmed deviations when asked", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { conAlerta: "true" } }, ANALISTA);

      assert.deepEqual(captured.filter, { conAlerta: true });
    });

    it("filters by oferta as a boolean", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { oferta: "true" } }, ANALISTA);
      assert.deepEqual(captured.filter, { oferta: true });

      await invoke(c.list, { query: { oferta: "false" } }, ANALISTA);
      assert.deepEqual(captured.filter, { oferta: false });
    });

    it("forces the own id for an ENCUESTADOR", async () => {
      const { c, captured } = listController();

      await invoke(c.list, { query: { encuestador: OTHER } }, ENCUESTADOR);

      assert.deepEqual(captured.filter, { encuestador: ME });
    });
  });

  describe("getById", () => {
    it("hides another encuestador's precio behind a 404 but lets an ANALISTA read it", async () => {
      const c = controller({ precios: { findById: async () => ({ encuestador: OTHER }) } });

      assert.equal((await invoke(c.getById, { params: { id: ID } }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(c.getById, { params: { id: ID } }, ANALISTA)).statusCode, 200);
    });
  });

  describe("update and remove", () => {
    it("updates only valor, observacion and oferta for the owner, passing the actor", async () => {
      let args: unknown[] = [];
      const c = controller({
        precios: {
          findById: async () => precio,
          update: async (...a: unknown[]) => {
            args = a;
            return { valor: 99 };
          },
        },
      });

      const res = await invoke(
        c.update,
        { params: { id: ID }, body: { valor: 99, observacion: " ok ", oferta: true, producto: "hack" } },
        ENCUESTADOR,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(args, [ID, { valor: 99, observacion: "ok", oferta: true, alerta: null }, { userId: ME, role: "ENCUESTADOR" }]);
    });

    it("answers 404 when the precio belongs to someone else", async () => {
      const c = controller({ precios: { findById: async () => ({ ...precio, encuestador: OTHER }) } });

      assert.equal((await invoke(c.update, { params: { id: ID }, body: { valor: 1 } }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(c.remove, { params: { id: ID } }, ENCUESTADOR)).statusCode, 404);
    });

    it("answers 409 when the relevamiento is CERRADO or the asignacion is no longer EN_CURSO", async () => {
      const closed = controller({
        precios: { findById: async () => precio },
        relevamientos: { findById: async () => ({ estado: "CERRADO" }) },
      });
      const completed = controller({
        precios: { findById: async () => precio },
        asignaciones: { hasEnCurso: async () => false },
      });

      assert.equal((await invoke(closed.update, { params: { id: ID }, body: { valor: 1 } }, ENCUESTADOR)).statusCode, 409);
      assert.equal((await invoke(completed.remove, { params: { id: ID } }, ENCUESTADOR)).statusCode, 409);
    });

    it("deletes with 204 for the owner, passing the actor", async () => {
      let args: unknown[] = [];
      const c = controller({
        precios: {
          findById: async () => precio,
          remove: async (...a: unknown[]) => {
            args = a;
            return precio;
          },
        },
      });

      const res = await invoke(c.remove, { params: { id: ID } }, ENCUESTADOR);

      assert.equal(res.statusCode, 204);
      assert.equal(res.ended, true);
      assert.deepEqual(args, [ID, { userId: ME, role: "ENCUESTADOR" }]);
    });

    describe("supervisor correction", () => {
      const other = { ...precio, encuestador: OTHER };

      it("lets a supervisor correct another surveyor's precio even after the asignacion is COMPLETADA", async () => {
        let args: unknown[] = [];
        const c = controller({
          precios: {
            findById: async () => other,
            update: async (...a: unknown[]) => {
              args = a;
              return { valor: 50 };
            },
          },
          asignaciones: { hasEnCurso: async () => false },
        });

        const res = await invoke(c.update, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(args, [ID, { valor: 50, alerta: null }, { userId: "sup-1", role: "SUPERVISOR" }]);
      });

      it("still answers 409 once the relevamiento is CERRADO", async () => {
        const c = controller({
          precios: { findById: async () => other },
          relevamientos: { findById: async () => ({ estado: "CERRADO" }) },
        });

        const res = await invoke(c.update, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(res.statusCode, 409);
      });

      it("answers 404 for an unknown precio", async () => {
        const c = controller({ precios: { findById: async () => null } });

        const res = await invoke(c.update, { params: { id: ID }, body: { valor: 50 } }, SUPERVISOR);

        assert.equal(res.statusCode, 404);
      });

      it("cannot delete: removal stays with the owner", async () => {
        const c = controller({ precios: { findById: async () => other } });

        const res = await invoke(c.remove, { params: { id: ID } }, SUPERVISOR);

        assert.equal(res.statusCode, 404);
      });
    });
  });
});
