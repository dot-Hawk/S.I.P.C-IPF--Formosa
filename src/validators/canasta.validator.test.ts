import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateCanastaEstado,
  validateCanastaFilters,
  validateVariedadCreate,
} from "./canasta.validator.js";

const valid = {
  codigo: "1111101",
  nombre: "Pan francés",
  padre: "11111",
  categoria: "NUCLEO",
};

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field);
}

describe("validateVariedadCreate", () => {
  it("accepts a minimal variedad and the optional fields", () => {
    assert.equal(validateVariedadCreate(valid).valid, true);
    assert.equal(
      validateVariedadCreate({
        ...valid,
        ponderador: 0.01,
        codigoVariedad12: "A0111111",
        tratamientoEspecial: true,
      }).valid,
      true,
    );
  });

  it("requires a 7 digit codigo and a 5 digit padre", () => {
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, codigo: "111" })), ["codigo"]);
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, codigo: "A111110" })), ["codigo"]);
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, padre: "1111" })), ["padre"]);
  });

  it("requires nombre and a valid categoria", () => {
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, nombre: "  " })), ["nombre"]);
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, categoria: "OTRA" })), ["categoria"]);
  });

  it("rejects a negative weight and a non boolean tratamientoEspecial", () => {
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, ponderador: -1 })), ["ponderador"]);
    assert.deepEqual(fields(validateVariedadCreate({ ...valid, tratamientoEspecial: "si" })), [
      "tratamientoEspecial",
    ]);
  });

  it("reports every missing field", () => {
    assert.deepEqual(fields(validateVariedadCreate({})).sort(), ["categoria", "codigo", "nombre", "padre"]);
  });
});

describe("validateCanastaEstado", () => {
  it("accepts ACTIVO and INACTIVO only", () => {
    assert.equal(validateCanastaEstado({ estado: "INACTIVO" }).valid, true);
    assert.equal(validateCanastaEstado({ estado: "BORRADO" }).valid, false);
    assert.equal(validateCanastaEstado({}).valid, false);
  });
});

describe("validateCanastaFilters", () => {
  it("accepts no filters and valid ones", () => {
    assert.equal(validateCanastaFilters({}).valid, true);
    assert.equal(
      validateCanastaFilters({ nivel: "6", padre: "11111", categoria: "REGULADO", estado: "ACTIVO" }).valid,
      true,
    );
  });

  it("rejects an invalid nivel, categoria or estado", () => {
    assert.deepEqual(fields(validateCanastaFilters({ nivel: "7" })), ["nivel"]);
    assert.deepEqual(fields(validateCanastaFilters({ nivel: "abc" })), ["nivel"]);
    assert.deepEqual(fields(validateCanastaFilters({ categoria: "X" })), ["categoria"]);
    assert.deepEqual(fields(validateCanastaFilters({ estado: "X" })), ["estado"]);
  });
});
