import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateComercioCreate,
  validateComercioEstado,
  validateComercioFilters,
  validateComercioUpdate,
} from "./comercio.validator.js";

const VALID = { nombre: "La Anónima", direccion: "San Martín 100", zona: "Centro", tipo: "SUPERMERCADO" };

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field).sort();
}

describe("validateComercioCreate", () => {
  it("accepts a valid comercio", () => {
    assert.equal(validateComercioCreate(VALID).valid, true);
  });

  it("rejects missing, blank and non-string fields", () => {
    const result = validateComercioCreate({ ...VALID, nombre: "  ", zona: undefined, direccion: 5 });

    assert.deepEqual(fields(result), ["direccion", "nombre", "zona"]);
  });

  it("rejects an unknown tipo", () => {
    assert.deepEqual(fields(validateComercioCreate({ ...VALID, tipo: "BAR" })), ["tipo"]);
  });
});

describe("validateComercioUpdate", () => {
  it("accepts a partial update", () => {
    assert.equal(validateComercioUpdate({ zona: "Norte" }).valid, true);
  });

  it("rejects an empty update", () => {
    assert.deepEqual(fields(validateComercioUpdate({})), ["body"]);
  });

  it("validates only the fields present", () => {
    assert.deepEqual(fields(validateComercioUpdate({ tipo: "BAR", nombre: "ok" })), ["tipo"]);
  });

  it("does not accept estado through a general update", () => {
    assert.deepEqual(fields(validateComercioUpdate({ estado: "INACTIVO" })), ["body"]);
  });
});

describe("validateComercioEstado", () => {
  it("accepts ACTIVO and INACTIVO", () => {
    assert.equal(validateComercioEstado({ estado: "INACTIVO" }).valid, true);
  });

  it("rejects anything else", () => {
    assert.deepEqual(fields(validateComercioEstado({ estado: "BORRADO" })), ["estado"]);
  });
});

describe("validateComercioFilters", () => {
  it("accepts no filters and valid filters", () => {
    assert.equal(validateComercioFilters({}).valid, true);
    assert.equal(validateComercioFilters({ zona: "Centro", tipo: "ALMACEN", estado: "ACTIVO" }).valid, true);
  });

  it("rejects invalid or non-string filters", () => {
    const result = validateComercioFilters({ zona: { $ne: "x" }, tipo: "BAR", estado: "X" });

    assert.deepEqual(fields(result), ["estado", "tipo", "zona"]);
  });
});
