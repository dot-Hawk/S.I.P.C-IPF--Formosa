import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRecursos, type Sheets } from "./canasta-source.js";

const ponderadores: Sheets = {
  IPN_Va_VApon: [
    ["Codigo", "Variedad", "Niv", "Ponderador", "VAR", "SUBCLASE", "CLASE", "GRUPO", "CAP"],
    ["0", "NIVEL GENERAL", "0", "1"],
    ["1111101", " Pan francés ", "6", "1.3341934E-2", "11111", "1111", "111", "11", "1"],
    ["3111101", "Alquiler", 6, 0.02, 31111, 3111, 311, 31, 3],
  ],
  Estacionales: [["VARIEDAD", null, null, "PONDERADOR"]],
  Regulados: [
    ["VARIEDAD", null, null, "PONDERADOR"],
    ["3111101", "Alquiler", "6", "0.02"],
  ],
  Núcleo: [
    ["VARIEDAD", null, null, "PONDERADOR"],
    ["1111101", "Pan francés", "6", "0.013"],
  ],
};

const diccionario: Sheets = {
  Hoja1: [
    ["VARIEDAD", "VARIEDAD_12", "nva_var_desc", "var_desc"],
    ["1111101", "A0111111", "Pan"],
    ["1111102", null, "no code"],
  ],
};

const tratamiento: Sheets = {
  Hoja1: [["3111101", "Alquiler"]],
  Medicamentos: [["5111101", "Analgésico 1"]],
};

describe("parseRecursos", () => {
  const source = parseRecursos({ ponderadores, diccionario, tratamiento });

  it("reads the basket nodes, trimming text and converting numbers", () => {
    assert.deepEqual(source.nodos[1], {
      codigo: "1111101",
      nombre: "Pan francés",
      nivel: 6,
      ponderador: 0.013341934,
      producto: "11111",
      subclase: "1111",
      clase: "111",
      grupo: "11",
      division: "1",
    });
  });

  it("keeps level 0 without ancestors and accepts numeric cells", () => {
    assert.deepEqual(source.nodos[0], { codigo: "0", nombre: "NIVEL GENERAL", nivel: 0, ponderador: 1 });
    assert.equal(source.nodos[2]?.codigo, "3111101");
    assert.equal(source.nodos[2]?.producto, "31111");
    assert.equal(source.nodos[2]?.division, "3");
  });

  it("reads categorias by the name of each sheet", () => {
    assert.deepEqual(source.categorias, {
      NUCLEO: ["1111101"],
      ESTACIONAL: [],
      REGULADO: ["3111101"],
    });
  });

  it("maps variedad to its 12 digit code, skipping rows without one", () => {
    assert.deepEqual(source.codigos12, { "1111101": "A0111111" });
  });

  it("collects the codes of every tratamiento especial sheet", () => {
    assert.deepEqual(source.tratamientoEspecial, ["3111101", "5111101"]);
  });

  it("fails clearly when a required sheet is missing", () => {
    assert.throws(
      () => parseRecursos({ ponderadores: { IPN_Va_VApon: [] }, diccionario, tratamiento }),
      /sheet Núcleo not found/,
    );
  });
});
