import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type PrecioFila } from "../domain/calculo-input.js";
import { type CanastaRepository } from "../repositories/canasta.repository.js";
import { type CalculoRepository } from "../repositories/calculo.repository.js";
import { CalculoError, createCalculoService } from "./calculo.service.js";
import { EngineError, type EngineClient, type EngineRequest, type EngineResponse } from "./engine-client.js";

const ACTOR = { userId: "00000000-0000-4000-8000-000000000001" };

const NODOS = [
  { codigo: "0", nivel: 0, padre: null, codigoVariedad12: null, tratamientoEspecial: null },
  { codigo: "1", nivel: 1, padre: "0", codigoVariedad12: null, tratamientoEspecial: null },
  { codigo: "1111101", nivel: 6, padre: "1", codigoVariedad12: "A0111111", tratamientoEspecial: false },
];

const FILAS: PrecioFila[] = [
  { periodo: "2026-01", oferta: false, valor: 100, codigoVariedad: "1111101", comercio: "c-1", tipoComercio: "ALMACEN" },
  { periodo: "2026-02", oferta: false, valor: 110, codigoVariedad: "1111101", comercio: "c-1", tipoComercio: "ALMACEN" },
];

const RESPONSE: EngineResponse = {
  version: "0.1.0",
  meses: ["2026-01", "2026-02"],
  relativos: [{ variedad: "1111101", mes: "2026-02", valor: 1.1, nSuper: 0, nTrad: 1 }],
  imputaciones: [
    { variedad: "1111101", informante: "c-2", mes: "2026-02", precio: 220, nivel: 0, grupo: "1111101", factor: 1.1 },
  ],
  sinImputar: [],
  especiales: [],
  resumen: { observaciones: 2, variedades: 1, informantes: 1, imputaciones: 1, sinImputar: 0 },
};

function setup(overrides: {
  relevamientos?: { periodo: string; estado: "ABIERTO" | "CERRADO" }[];
  filas?: PrecioFila[];
  engine?: EngineClient;
  busy?: boolean;
} = {}) {
  const saved: { calculo?: Record<string, unknown>; relativos?: unknown[]; imputaciones?: unknown[] }[] = [];
  const sent: EngineRequest[] = [];
  let started: Record<string, unknown> | undefined;

  const calculos = {
    relevamientosEntre: async () =>
      overrides.relevamientos ?? [
        { periodo: "2026-01", estado: "CERRADO" },
        { periodo: "2026-02-Q1", estado: "CERRADO" },
        { periodo: "2026-02-Q2", estado: "CERRADO" },
      ],
    preciosEntre: async () => overrides.filas ?? FILAS,
    iniciar: async (calculo: Record<string, unknown>) => {
      if (overrides.busy) return null;
      started = { id: "calc-1", ...calculo, estado: "EJECUTANDO" };
      return started;
    },
    completar: async (_id: string, resultado: Record<string, unknown>, relativos: unknown[], imputaciones: unknown[]) => {
      saved.push({ calculo: { ...started, ...resultado, estado: "COMPLETADO" }, relativos, imputaciones });
      return { ...started, ...resultado, estado: "COMPLETADO" };
    },
    fallar: async (_id: string, error: string) => {
      saved.push({ calculo: { ...started, estado: "FALLIDO", error }, relativos: [], imputaciones: [] });
    },
  } as unknown as CalculoRepository;

  const canasta = { findAll: async () => NODOS } as unknown as CanastaRepository;

  const engine: EngineClient = overrides.engine ?? {
    calcular: async (request) => {
      sent.push(request);
      return RESPONSE;
    },
  };

  return { service: createCalculoService({ calculos, canasta, engine }), saved, sent };
}

async function correr(service: ReturnType<typeof setup>["service"], input: Parameters<typeof service.iniciar>[0]) {
  const run = await service.iniciar(input, ACTOR);
  await run.terminado;
  return run.calculo;
}

describe("calculo service", () => {
  it("builds the engine input from the closed relevamientos and stores the run", async () => {
    const { service, saved, sent } = setup();

    const { calculo, terminado } = await service.iniciar({ mesBase: "2026-01", mesObjetivo: "2026-02" }, ACTOR);
    assert.equal(calculo.estado, "EJECUTANDO");
    await terminado;

    assert.equal(sent[0]?.observaciones.length, 2);
    assert.deepEqual(sent[0]?.variedades, [
      { codigo: "1111101", grupos: ["A0111111", "A01111", "A0111", "A011", "A01", "A"], tratamientoEspecial: false },
    ]);
    assert.equal(sent[0]?.parametros.pesoSuper, 0.25);

    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.calculo?.["estado"], "COMPLETADO");
    assert.equal(saved[0]?.calculo?.["creadoPor"], ACTOR.userId);
    assert.equal(saved[0]?.calculo?.["motorVersion"], "0.1.0");
    assert.equal(saved[0]?.calculo?.["mesBase"], "2026-01");
    assert.match(String(saved[0]?.calculo?.["entradaHash"]), /^[0-9a-f]{64}$/);
    assert.deepEqual(saved[0]?.relativos, [
      { variedad: "1111101", mes: "2026-02", valor: 1.1, nSuper: 0, nTrad: 1 },
    ]);
    assert.deepEqual(saved[0]?.imputaciones, [
      { variedad: "1111101", comercio: "c-2", mes: "2026-02", precio: 220, nivel: 0, grupo: "1111101", factor: 1.1 },
    ]);
    assert.equal(calculo.id, "calc-1");
  });

  it("passes the options and parameters through, and the same input gives the same hash", async () => {
    const first = setup();
    const second = setup();
    const options = {
      mesBase: "2026-01",
      mesObjetivo: "2026-02",
      excluirOfertas: true,
      parametros: { esperarMeses: 3, pesoSuper: 0.5, pesoTrad: 0.5, omitirGruposCompletos: false },
    };

    await correr(first.service, options);
    await correr(second.service, options);

    assert.deepEqual(first.sent[0]?.parametros, options.parametros);
    assert.equal(first.saved[0]?.calculo?.["excluirOfertas"], true);
    assert.equal(first.saved[0]?.calculo?.["entradaHash"], second.saved[0]?.calculo?.["entradaHash"]);
  });

  it("refuses to run while a relevamiento of the range is still open", async () => {
    const { service, sent } = setup({
      relevamientos: [
        { periodo: "2026-01", estado: "CERRADO" },
        { periodo: "2026-02-Q1", estado: "CERRADO" },
        { periodo: "2026-02-Q2", estado: "ABIERTO" },
      ],
    });

    await assert.rejects(service.iniciar({ mesBase: "2026-01", mesObjetivo: "2026-02" }, ACTOR), (error: unknown) => {
      assert.ok(error instanceof CalculoError);
      assert.equal(error.status, 409);
      assert.match(error.message, /2026-02-Q2/);
      return true;
    });
    assert.equal(sent.length, 0);
  });

  it("refuses a month that has no relevamiento", async () => {
    const { service } = setup({ relevamientos: [{ periodo: "2026-01", estado: "CERRADO" }] });

    await assert.rejects(service.iniciar({ mesBase: "2026-01", mesObjetivo: "2026-02" }, ACTOR), (error: unknown) => {
      assert.ok(error instanceof CalculoError);
      assert.equal(error.status, 409);
      assert.match(error.message, /2026-02/);
      return true;
    });
  });

  it("refuses to run without prices", async () => {
    const { service } = setup({ filas: [] });

    await assert.rejects(service.iniciar({ mesBase: "2026-01", mesObjetivo: "2026-02" }, ACTOR), (error: unknown) => {
      assert.ok(error instanceof CalculoError);
      assert.equal(error.status, 409);
      return true;
    });
  });

  it("records the engine's reason on the run when it rejects the data", async () => {
    const { service, saved } = setup({
      engine: {
        calcular: async () => {
          throw new EngineError("rejected", "no hay precios para el mes 2026-02");
        },
      },
    });

    const calculo = await correr(service, { mesBase: "2026-01", mesObjetivo: "2026-02" });

    assert.equal(calculo.estado, "EJECUTANDO");
    assert.equal(saved[0]?.calculo?.["estado"], "FALLIDO");
    assert.match(String(saved[0]?.calculo?.["error"]), /2026-02/);
  });

  it("records the failure when the engine is unavailable", async () => {
    const { service, saved } = setup({
      engine: {
        calcular: async () => {
          throw new EngineError("unavailable", "The calculation engine could not be reached");
        },
      },
    });

    await correr(service, { mesBase: "2026-01", mesObjetivo: "2026-02" });

    assert.equal(saved[0]?.calculo?.["estado"], "FALLIDO");
    assert.match(String(saved[0]?.calculo?.["error"]), /could not be reached/);
  });

  it("hides the details of an unexpected error and still ends the run as FALLIDO", async () => {
    const { service, saved } = setup({
      engine: {
        calcular: async () => {
          throw new Error("secret connection string in message");
        },
      },
    });
    const originalError = console.error;
    console.error = () => undefined;

    try {
      await correr(service, { mesBase: "2026-01", mesObjetivo: "2026-02" });
    } finally {
      console.error = originalError;
    }

    assert.equal(saved[0]?.calculo?.["estado"], "FALLIDO");
    assert.doesNotMatch(String(saved[0]?.calculo?.["error"]), /secret/);
  });

  it("answers right away, before the engine has finished", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, saved } = setup({
      engine: {
        calcular: async () => {
          await gate;
          return RESPONSE;
        },
      },
    });

    const { calculo, terminado } = await service.iniciar({ mesBase: "2026-01", mesObjetivo: "2026-02" }, ACTOR);

    assert.equal(calculo.estado, "EJECUTANDO");
    assert.equal(saved.length, 0);
    release();
    await terminado;
    assert.equal(saved[0]?.calculo?.["estado"], "COMPLETADO");
  });

  it("refuses with 409 while another run is executing, without calling the engine", async () => {
    const { service, sent } = setup({ busy: true });

    await assert.rejects(service.iniciar({ mesBase: "2026-01", mesObjetivo: "2026-02" }, ACTOR), (error: unknown) => {
      assert.ok(error instanceof CalculoError);
      assert.equal(error.status, 409);
      assert.match(error.message, /en ejecución/);
      return true;
    });
    assert.equal(sent.length, 0);
  });

  it("keeps the unresolved prices in the summary", async () => {
    const { service, saved } = setup({
      engine: {
        calcular: async () => ({
          ...RESPONSE,
          sinImputar: [{ variedad: "1111101", informante: "c-9", mes: "2026-02" }],
          resumen: { ...RESPONSE.resumen, sinImputar: 1 },
        }),
      },
    });

    await correr(service, { mesBase: "2026-01", mesObjetivo: "2026-02" });

    const resumen = saved[0]?.calculo?.["resumen"] as { sinImputar: number; sinImputarDetalle: unknown[] };
    assert.equal(resumen.sinImputar, 1);
    assert.deepEqual(resumen.sinImputarDetalle, [{ variedad: "1111101", comercio: "c-9", mes: "2026-02" }]);
  });

  describe("exportar", () => {
    it("builds the same input the engine would receive, without calling it", async () => {
      const { service, sent } = setup();

      const entrada = await service.exportar({ mesBase: "2026-01", mesObjetivo: "2026-02" });

      assert.equal(sent.length, 0);
      assert.equal(entrada.observaciones.length, 2);
      assert.deepEqual(entrada.variedades, [
        { codigo: "1111101", grupos: ["A0111111", "A01111", "A0111", "A011", "A01", "A"], tratamientoEspecial: false },
      ]);
    });

    it("applies the same rules: the whole range closed, with prices", async () => {
      const open = setup({ relevamientos: [{ periodo: "2026-01", estado: "ABIERTO" }] });
      const empty = setup({ filas: [] });

      await assert.rejects(
        () => open.service.exportar({ mesBase: "2026-01", mesObjetivo: "2026-01" }),
        (e: unknown) => e instanceof CalculoError && e.status === 409,
      );
      await assert.rejects(
        () => empty.service.exportar({ mesBase: "2026-01", mesObjetivo: "2026-02" }),
        (e: unknown) => e instanceof CalculoError && e.status === 409,
      );
    });

    it("leaves promotional prices out on request", async () => {
      const filas: PrecioFila[] = [
        ...FILAS,
        { periodo: "2026-02", oferta: true, valor: 50, codigoVariedad: "1111101", comercio: "c-9", tipoComercio: "ALMACEN" },
      ];
      const { service } = setup({ filas });

      const all = await service.exportar({ mesBase: "2026-01", mesObjetivo: "2026-02" });
      const withoutOffers = await service.exportar({
        mesBase: "2026-01",
        mesObjetivo: "2026-02",
        excluirOfertas: true,
      });

      assert.equal(all.observaciones.length, 3);
      assert.equal(withoutOffers.observaciones.length, 2);
    });
  });
});
