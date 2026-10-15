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
    it("starts the calculation as the authenticated user and answers 202 with the run", async () => {
      let args: unknown[] = [];
      const service = {
        iniciar: async (...a: unknown[]) => {
          args = a;
          return { calculo: { id: ID, estado: "EJECUTANDO" }, terminado: Promise.resolve() };
        },
      };

      const res = await invoke(
        controller({ service }).create,
        { body: { mesBase: "2026-01", mesObjetivo: "2026-03" } },
        ANALISTA,
      );

      assert.equal(res.statusCode, 202);
      assert.deepEqual(res.body, { id: ID, estado: "EJECUTANDO" });
      assert.deepEqual(args, [{ mesBase: "2026-01", mesObjetivo: "2026-03" }, { userId: ME }]);
    });

    it("answers 409 with the reason when the run cannot start", async () => {
      for (const status of [409] as const) {
        const service = {
          iniciar: async () => {
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
        iniciar: async () => {
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

  describe("exportar", () => {
    const entrada = {
      observaciones: [{ variedad: "1111101", informante: "c-1", tipo: "TRAD", mes: "2026-01", precio: 100 }],
      variedades: [{ codigo: "1111101", grupos: ["A01"], tratamientoEspecial: false }],
    };

    it("sends an xlsx for the engine by default, as a download", async () => {
      let received: unknown[] = [];
      const service = {
        exportar: async (...a: unknown[]) => {
          received = a;
          return entrada;
        },
      };

      const res = await invoke(
        controller({ service }).exportar,
        { query: { mesBase: "2026-01", mesObjetivo: "2026-03", excluirOfertas: "true" } },
        ANALISTA,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(received, [{ mesBase: "2026-01", mesObjetivo: "2026-03", excluirOfertas: true }]);
      assert.equal(
        res.headers["content-type"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      assert.equal(res.headers["content-disposition"], 'attachment; filename="precios_2026-01_2026-03.xlsx"');
      assert.equal(res.headers["cache-control"], "private, no-store");
      assert.equal((res.body as Buffer).subarray(0, 2).toString(), "PK");
    });

    it("sends a csv of the prices when asked", async () => {
      const service = { exportar: async () => entrada };

      const res = await invoke(
        controller({ service }).exportar,
        { query: { mesBase: "2026-01", mesObjetivo: "2026-03", formato: "csv" } },
        ANALISTA,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "text/csv; charset=utf-8");
      assert.equal(res.headers["content-disposition"], 'attachment; filename="precios_2026-01_2026-03.csv"');
      assert.equal(
        String(res.body),
        "VARIEDAD,INFORMANTE,TIPO,MES,PRECIO\r\n1111101,c-1,TRAD,2026-01,100\r\n",
      );
    });

    it("answers 400 on an invalid query and maps the service errors", async () => {
      const failing = {
        exportar: async () => {
          throw new CalculoError(409, "Hay relevamientos abiertos: 2026-01");
        },
      };

      const bad = await invoke(
        controller({ service: {} }).exportar,
        { query: { mesBase: "enero", mesObjetivo: "2026-03", formato: "pdf" } },
        ANALISTA,
      );
      const conflict = await invoke(
        controller({ service: failing }).exportar,
        { query: { mesBase: "2026-01", mesObjetivo: "2026-03" } },
        ANALISTA,
      );

      assert.equal(bad.statusCode, 400);
      assert.equal(conflict.statusCode, 409);
    });
  });

  describe("resultados", () => {
    const calculo = {
      id: ID,
      estado: "COMPLETADO",
      mesBase: "2026-01",
      mesObjetivo: "2026-03",
      excluirOfertas: false,
      motorVersion: "0.1.0",
      entradaHash: "abc",
      parametros: { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true },
      createdAt: new Date("2026-10-14T12:00:00Z"),
    };
    const calculos = {
      findById: async () => calculo,
      relativos: async () => [{ variedad: "1111101", mes: "2026-02", valor: 1.1, nSuper: 1, nTrad: 2 }],
      allImputaciones: async () => [],
    };

    it("sends the run's results as xlsx by default and as csv when asked", async () => {
      const xlsx = await invoke(controller({ calculos }).resultados, { params: { id: ID }, query: {} }, ANALISTA);
      const csv = await invoke(
        controller({ calculos }).resultados,
        { params: { id: ID }, query: { formato: "csv" } },
        ANALISTA,
      );

      assert.equal(xlsx.statusCode, 200);
      assert.equal(xlsx.headers["content-disposition"], `attachment; filename="resultados_${ID}.xlsx"`);
      assert.equal((xlsx.body as Buffer).subarray(0, 2).toString(), "PK");
      assert.equal(csv.statusCode, 200);
      assert.equal(csv.headers["content-type"], "text/csv; charset=utf-8");
      assert.equal(String(csv.body), "VARIEDAD,2026-02\r\n1111101,1.1\r\n");
    });

    it("answers 400 on a bad id or format, 404 for an unknown run and 409 for a failed one", async () => {
      const failed = { ...calculos, findById: async () => ({ ...calculo, estado: "FALLIDO" }) };
      const missing = { ...calculos, findById: async () => null };

      const badId = await invoke(controller({ calculos }).resultados, { params: { id: "x" }, query: {} }, ANALISTA);
      const badFormat = await invoke(
        controller({ calculos }).resultados,
        { params: { id: ID }, query: { formato: "pdf" } },
        ANALISTA,
      );
      const notFound = await invoke(controller({ calculos: missing }).resultados, { params: { id: ID }, query: {} }, ANALISTA);
      const conflict = await invoke(controller({ calculos: failed }).resultados, { params: { id: ID }, query: {} }, ANALISTA);

      assert.equal(badId.statusCode, 400);
      assert.equal(badFormat.statusCode, 400);
      assert.equal(notFound.statusCode, 404);
      assert.equal(conflict.statusCode, 409);
    });
  });
});
