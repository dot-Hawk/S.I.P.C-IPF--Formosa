import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateProductoCreate,
  validateProductoEstado,
  validateProductoFilters,
  validateProductoUpdate,
} from "./producto.validator.js";

const VALID = { nombre: "Arroz", categoria: "Almacen", unidad: "KG", cantidadReferencia: 1 };

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field).sort();
}

describe("validateProductoCreate", () => {
  it("accepts a valid producto with and without marca", () => {
    assert.equal(validateProductoCreate(VALID).valid, true);
    assert.equal(validateProductoCreate({ ...VALID, marca: "Gallo" }).valid, true);
  });

  it("rejects missing or blank required fields", () => {
    const result = validateProductoCreate({ ...VALID, nombre: " ", categoria: undefined });

    assert.deepEqual(fields(result), ["categoria", "nombre"]);
  });

  it("rejects an unknown unidad", () => {
    assert.deepEqual(fields(validateProductoCreate({ ...VALID, unidad: "TON" })), ["unidad"]);
  });

  it("rejects non-positive, non-finite or non-number cantidadReferencia", () => {
    for (const bad of [0, -1, Infinity, NaN, "1"]) {
      assert.deepEqual(fields(validateProductoCreate({ ...VALID, cantidadReferencia: bad })), ["cantidadReferencia"]);
    }
  });

  it("rejects a blank marca when provided", () => {
    assert.deepEqual(fields(validateProductoCreate({ ...VALID, marca: "  " })), ["marca"]);
  });
});

describe("validateProductoUpdate", () => {
  it("accepts a partial update", () => {
    assert.equal(validateProductoUpdate({ cantidadReferencia: 500 }).valid, true);
  });

  it("rejects an empty update and estado through the general update", () => {
    assert.deepEqual(fields(validateProductoUpdate({})), ["body"]);
    assert.deepEqual(fields(validateProductoUpdate({ estado: "INACTIVO" })), ["body"]);
  });

  it("validates only the fields present", () => {
    assert.deepEqual(fields(validateProductoUpdate({ unidad: "TON", nombre: "ok" })), ["unidad"]);
  });
});

describe("validateProductoEstado", () => {
  it("accepts ACTIVO and INACTIVO only", () => {
    assert.equal(validateProductoEstado({ estado: "ACTIVO" }).valid, true);
    assert.deepEqual(fields(validateProductoEstado({ estado: "BORRADO" })), ["estado"]);
  });
});

describe("validateProductoFilters", () => {
  it("accepts no filters and valid filters", () => {
    assert.equal(validateProductoFilters({}).valid, true);
    assert.equal(validateProductoFilters({ categoria: "Almacen", unidad: "KG", estado: "ACTIVO" }).valid, true);
  });

  it("rejects invalid or non-string filters", () => {
    const result = validateProductoFilters({ categoria: { $ne: "x" }, unidad: "TON", estado: "X" });

    assert.deepEqual(fields(result), ["categoria", "estado", "unidad"]);
  });
});
