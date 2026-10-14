import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCanasta, type CanastaSource, type RawNodo } from "./canasta.js";

function nodo(codigo: string, nombre: string, nivel: number, ponderador: number, extra: Partial<RawNodo> = {}): RawNodo {
  return { codigo, nombre, nivel, ponderador, ...extra };
}

// Explicit ancestors of a variedad that hangs from the existing subclase 1111.
const CHAIN_1111 = { subclase: "1111", clase: "111", grupo: "11", division: "1" };

function source(overrides: Partial<CanastaSource> = {}): CanastaSource {
  return {
    nodos: [
      nodo("0", "NIVEL GENERAL", 0, 1),
      nodo("1", "ALIMENTOS", 1, 1),
      nodo("11", "ALIMENTOS EN EL HOGAR", 2, 1),
      nodo("111", "PANIFICACION", 3, 1),
      nodo("1111", "PANIFICACION", 4, 1),
      nodo("11111", "Pan fresco", 5, 1),
      nodo("1111101", "Pan frances", 6, 0.6, { producto: "11111" }),
      nodo("1111102", "Pan integral", 6, 0.4, { producto: "11111" }),
    ],
    categorias: { NUCLEO: ["1111101", "1111102"], ESTACIONAL: [], REGULADO: [] },
    codigos12: { "1111101": "A0111111" },
    tratamientoEspecial: [],
    ...overrides,
  };
}

describe("buildCanasta", () => {
  it("links every node to its parent: root has none, level 1 hangs from the root", () => {
    const { nodos } = buildCanasta(source());
    const padre = (codigo: string) => nodos.find((n) => n.codigo === codigo)?.padre;

    assert.equal(padre("0"), null);
    assert.equal(padre("1"), "0");
    assert.equal(padre("11"), "1");
    assert.equal(padre("1111"), "111");
    assert.equal(padre("11111"), "1111");
    assert.equal(padre("1111101"), "11111");
  });

  it("uses the explicit producto of a variedad as its parent", () => {
    const input = source();
    input.nodos[6] = nodo("1111101", "Pan frances", 6, 0.6, { producto: "11111" });

    const { nodos } = buildCanasta(input);

    assert.equal(nodos.find((n) => n.codigo === "1111101")?.padre, "11111");
  });

  it("derives a missing producto node from its variedades, summing the weights", () => {
    const input = source({
      nodos: [
        ...source().nodos,
        nodo("1121201", "Bife angosto", 6, 0.3, { ...CHAIN_1111, producto: "11212" }),
        nodo("1121202", "Bola de lomo", 6, 0.2, { ...CHAIN_1111, producto: "11212" }),
      ],
      categorias: { NUCLEO: ["1111101", "1111102", "1121201", "1121202"], ESTACIONAL: [], REGULADO: [] },
    });

    const { nodos, derivados } = buildCanasta(input);
    const derived = nodos.find((n) => n.codigo === "11212");

    assert.deepEqual(derivados, ["11212"]);
    assert.equal(derived?.nivel, 5);
    assert.equal(derived?.nombre, "Sin denominación");
    assert.equal(derived?.padre, "1111");
    assert.equal(derived?.derivado, true);
    assert.equal(derived?.ponderador, 0.5);
    assert.equal(nodos.find((n) => n.codigo === "1121201")?.padre, "11212");
  });

  it("derives every missing ancestor in the explicit chain of a variedad", () => {
    const input = source({
      nodos: [
        ...source().nodos,
        nodo("1211101", "Sandalia", 6, 0.25, {
          producto: "12111",
          subclase: "1211",
          clase: "121",
          grupo: "12",
          division: "1",
        }),
      ],
      categorias: { NUCLEO: ["1111101", "1111102", "1211101"], ESTACIONAL: [], REGULADO: [] },
    });

    const { nodos, derivados } = buildCanasta(input);
    const find = (codigo: string) => nodos.find((n) => n.codigo === codigo);

    assert.deepEqual([...derivados].sort(), ["12", "121", "1211", "12111"]);
    assert.deepEqual(
      ["12111", "1211", "121", "12"].map((c) => [find(c)?.nivel, find(c)?.padre]),
      [
        [5, "1211"],
        [4, "121"],
        [3, "12"],
        [2, "1"],
      ],
    );
    assert.ok(["12111", "1211", "121", "12"].every((c) => find(c)?.ponderador === 0.25));
  });

  it("assigns categoria, codigoVariedad12 and tratamientoEspecial to variedades only", () => {
    const { nodos } = buildCanasta(
      source({
        categorias: { NUCLEO: ["1111101"], ESTACIONAL: ["1111102"], REGULADO: [] },
        tratamientoEspecial: ["1111102"],
      }),
    );
    const find = (codigo: string) => nodos.find((n) => n.codigo === codigo);

    assert.equal(find("1111101")?.categoria, "NUCLEO");
    assert.equal(find("1111102")?.categoria, "ESTACIONAL");
    assert.equal(find("1111101")?.codigoVariedad12, "A0111111");
    assert.equal(find("1111102")?.codigoVariedad12, undefined);
    assert.equal(find("1111101")?.tratamientoEspecial, false);
    assert.equal(find("1111102")?.tratamientoEspecial, true);
    assert.equal(find("11111")?.categoria, undefined);
    assert.equal(find("11111")?.tratamientoEspecial, undefined);
  });

  it("reports the variedades without codigoVariedad12 as a warning", () => {
    const { advertencias } = buildCanasta(source());

    assert.deepEqual(advertencias.sinCodigoVariedad12, ["1111102"]);
  });

  it("starts every node ACTIVO", () => {
    const { nodos } = buildCanasta(source());

    assert.ok(nodos.every((n) => n.estado === "ACTIVO"));
  });

  describe("rejects inconsistent input", () => {
    it("duplicated codes", () => {
      const input = source();
      input.nodos.push(nodo("1111101", "again", 6, 0, { producto: "11111" }));

      assert.throws(() => buildCanasta(input), /duplicated codigo: 1111101/);
    });

    it("a level outside 0-6", () => {
      const input = source({ nodos: [nodo("0", "x", 0, 1), nodo("9", "bad", 7, 0)] });

      assert.throws(() => buildCanasta(input), /invalid nivel/);
    });

    it("a node whose parent does not exist", () => {
      const input = source({ nodos: [nodo("0", "x", 0, 1), nodo("11", "orphan", 2, 1)] });

      assert.throws(() => buildCanasta(input), /parent 1 of 11 not found/);
    });

    it("a variedad with no categoria", () => {
      const input = source({ categorias: { NUCLEO: ["1111101"], ESTACIONAL: [], REGULADO: [] } });

      assert.throws(() => buildCanasta(input), /1111102 has no categoria/);
    });

    it("a variedad in two categorias", () => {
      const input = source({ categorias: { NUCLEO: ["1111101", "1111102"], ESTACIONAL: ["1111101"], REGULADO: [] } });

      assert.throws(() => buildCanasta(input), /1111101 is in more than one categoria/);
    });

    it("categorias or tratamiento especial naming an unknown variedad", () => {
      assert.throws(
        () => buildCanasta(source({ tratamientoEspecial: ["9999999"] })),
        /tratamiento especial 9999999 is not a variedad/,
      );
      assert.throws(
        () => buildCanasta(source({ categorias: { NUCLEO: ["1111101", "1111102", "9999999"], ESTACIONAL: [], REGULADO: [] } })),
        /categoria NUCLEO references unknown variedad 9999999/,
      );
    });

    it("a negative weight", () => {
      const input = source();
      input.nodos[6] = nodo("1111101", "Pan frances", 6, -1, { producto: "11111" });

      assert.throws(() => buildCanasta(input), /invalid ponderador/);
    });
  });
});
