import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateAsignacionCreate,
  validateAsignacionEstado,
  validateAsignacionFilters,
  validateAsignacionReassign,
} from "./asignacion.validator.js";

const ID = "00000000-0000-4000-8000-000000000011";

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field).sort();
}

describe("validateAsignacionCreate", () => {
  it("accepts three valid ids", () => {
    assert.equal(validateAsignacionCreate({ relevamiento: ID, encuestador: ID, comercio: ID }).valid, true);
  });

  it("rejects missing, malformed and non-string ids", () => {
    const result = validateAsignacionCreate({ relevamiento: "abc", encuestador: 123456789012, comercio: undefined });

    assert.deepEqual(fields(result), ["comercio", "encuestador", "relevamiento"]);
  });

  it("rejects an ObjectId-like string", () => {
    assert.deepEqual(
      fields(validateAsignacionCreate({ relevamiento: "123456789012", encuestador: ID, comercio: ID })),
      ["relevamiento"],
    );
  });
});

describe("validateAsignacionReassign", () => {
  it("requires a valid encuestador id", () => {
    assert.equal(validateAsignacionReassign({ encuestador: ID }).valid, true);
    assert.deepEqual(fields(validateAsignacionReassign({})), ["encuestador"]);
  });
});

describe("validateAsignacionEstado", () => {
  it("accepts a known estado only", () => {
    assert.equal(validateAsignacionEstado({ estado: "EN_CURSO" }).valid, true);
    assert.deepEqual(fields(validateAsignacionEstado({ estado: "CANCELADA" })), ["estado"]);
  });
});

describe("validateAsignacionFilters", () => {
  it("accepts no filters and valid filters", () => {
    assert.equal(validateAsignacionFilters({}).valid, true);
    assert.equal(validateAsignacionFilters({ relevamiento: ID, estado: "PENDIENTE" }).valid, true);
    assert.equal(validateAsignacionFilters({ estado: "CANCELADA" }).valid, true);
  });

  it("rejects invalid ids, objects and unknown estados", () => {
    const result = validateAsignacionFilters({ comercio: { $ne: ID }, encuestador: "x", estado: "Z" });

    assert.deepEqual(fields(result), ["comercio", "encuestador", "estado"]);
  });
});
