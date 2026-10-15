import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildObservaciones,
  buildVariedades,
  gruposDesdeCodigo12,
  mesDePeriodo,
  nodosVariedad,
  rangoMeses,
  tipoInformante,
  type NodoVariedad,
  type PrecioFila,
} from "./calculo-input.js";

function fila(overrides: Partial<PrecioFila> = {}): PrecioFila {
  return {
    periodo: "2026-10",
    oferta: false,
    valor: 100,
    codigoVariedad: "1111101",
    comercio: "c-1",
    tipoComercio: "ALMACEN",
    ...overrides,
  };
}

describe("mesDePeriodo", () => {
  it("takes the month of monthly and biweekly periods", () => {
    assert.equal(mesDePeriodo("2026-10"), "2026-10");
    assert.equal(mesDePeriodo("2026-10-Q1"), "2026-10");
    assert.equal(mesDePeriodo("2026-10-Q2"), "2026-10");
  });

  it("rejects anything else", () => {
    assert.throws(() => mesDePeriodo("octubre"), /periodo/);
  });
});

describe("tipoInformante", () => {
  it("maps supermarkets to SUPER and every other kind of commerce to TRAD", () => {
    assert.equal(tipoInformante("SUPERMERCADO"), "SUPER");
    for (const tipo of ["ALMACEN", "VERDULERIA", "CARNICERIA", "FARMACIA", "OTRO"] as const) {
      assert.equal(tipoInformante(tipo), "TRAD");
    }
  });
});

describe("buildObservaciones", () => {
  it("averages the prices of one variedad in one commerce and month", () => {
    const filas = [
      fila({ valor: 100, periodo: "2026-10-Q1" }),
      fila({ valor: 120, periodo: "2026-10-Q2" }),
      fila({ valor: 80, codigoVariedad: "1111101" }), // another brand of the same variedad
    ];

    const result = buildObservaciones(filas, { excluirOfertas: false });

    assert.deepEqual(result, [
      { variedad: "1111101", informante: "c-1", tipo: "TRAD", mes: "2026-10", precio: 100 },
    ]);
  });

  it("keeps variedades, commerces and months apart", () => {
    const filas = [
      fila({ codigoVariedad: "1111102", valor: 10 }),
      fila({ comercio: "c-2", tipoComercio: "SUPERMERCADO", valor: 20 }),
      fila({ periodo: "2026-11", valor: 30 }),
    ];

    const result = buildObservaciones(filas, { excluirOfertas: false });

    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((o) => [o.variedad, o.informante, o.mes, o.tipo, o.precio]),
      [
        ["1111101", "c-1", "2026-11", "TRAD", 30],
        ["1111101", "c-2", "2026-10", "SUPER", 20],
        ["1111102", "c-1", "2026-10", "TRAD", 10],
      ],
    );
  });

  it("drops promotional prices only when asked to", () => {
    const filas = [fila({ valor: 100 }), fila({ valor: 50, oferta: true, codigoVariedad: "1111102" })];

    assert.equal(buildObservaciones(filas, { excluirOfertas: false }).length, 2);
    assert.deepEqual(
      buildObservaciones(filas, { excluirOfertas: true }).map((o) => o.variedad),
      ["1111101"],
    );
  });

  it("includes an offer in the average when offers are not excluded", () => {
    const filas = [fila({ valor: 100 }), fila({ valor: 60, oferta: true })];

    assert.equal(buildObservaciones(filas, { excluirOfertas: false })[0]?.precio, 80);
    assert.equal(buildObservaciones(filas, { excluirOfertas: true })[0]?.precio, 100);
  });
});

describe("gruposDesdeCodigo12", () => {
  it("builds the hierarchy from the prefixes of the 12-division code", () => {
    assert.deepEqual(gruposDesdeCodigo12("A0111111"), [
      "A0111111",
      "A01111",
      "A0111",
      "A011",
      "A01",
      "A",
    ]);
  });
});

describe("buildVariedades", () => {
  const nodo = (overrides: Partial<NodoVariedad> = {}): NodoVariedad => ({
    codigo: "1111101",
    codigoVariedad12: "A0111111",
    tratamientoEspecial: false,
    ancestros: ["11111", "1111", "111", "11", "1"],
    ...overrides,
  });

  it("uses the 12-division code when the variedad has one", () => {
    const [variedad] = buildVariedades([nodo()]);

    assert.equal(variedad?.grupos[0], "A0111111");
    assert.equal(variedad?.tratamientoEspecial, false);
  });

  it("falls back to the basket hierarchy, namespaced so it never mixes with the 12-division codes", () => {
    const [variedad] = buildVariedades([nodo({ codigoVariedad12: null })]);

    assert.deepEqual(variedad?.grupos, ["C:11111", "C:1111", "C:111", "C:11", "C:1"]);
  });

  it("carries the special-treatment flag", () => {
    const [variedad] = buildVariedades([nodo({ tratamientoEspecial: true })]);

    assert.equal(variedad?.tratamientoEspecial, true);
  });
});

describe("nodosVariedad", () => {
  const nodos = [
    { codigo: "0", nivel: 0, padre: null, codigoVariedad12: null, tratamientoEspecial: null },
    { codigo: "1", nivel: 1, padre: "0", codigoVariedad12: null, tratamientoEspecial: null },
    { codigo: "11", nivel: 2, padre: "1", codigoVariedad12: null, tratamientoEspecial: null },
    { codigo: "111", nivel: 3, padre: "11", codigoVariedad12: null, tratamientoEspecial: null },
    { codigo: "1111", nivel: 4, padre: "111", codigoVariedad12: null, tratamientoEspecial: null },
    { codigo: "11111", nivel: 5, padre: "1111", codigoVariedad12: null, tratamientoEspecial: null },
    { codigo: "1111102", nivel: 6, padre: "11111", codigoVariedad12: "A0111112", tratamientoEspecial: true },
    { codigo: "1111101", nivel: 6, padre: "11111", codigoVariedad12: null, tratamientoEspecial: false },
  ];

  it("keeps only the variedades, sorted, with their ancestors and without the root", () => {
    const result = nodosVariedad(nodos);

    assert.deepEqual(
      result.map((n) => n.codigo),
      ["1111101", "1111102"],
    );
    assert.deepEqual(result[0]?.ancestros, ["11111", "1111", "111", "11", "1"]);
  });

  it("carries the 12-division code and a null flag as false", () => {
    const [, second] = nodosVariedad(nodos);

    assert.equal(second?.codigoVariedad12, "A0111112");
    assert.equal(second?.tratamientoEspecial, true);
    assert.equal(nodosVariedad(nodos)[0]?.tratamientoEspecial, false);
  });
});

describe("rangoMeses", () => {
  it("lists every month, crossing years", () => {
    assert.deepEqual(rangoMeses("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(rangoMeses("2026-03", "2026-03"), ["2026-03"]);
  });
});
