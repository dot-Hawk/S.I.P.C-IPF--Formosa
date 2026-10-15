import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateAuditoriaFilters } from "./auditoria.validator.js";

const ID = "00000000-0000-4000-8000-000000000011";

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field).sort();
}

describe("validateAuditoriaFilters", () => {
  it("accepts no filters and valid ones", () => {
    assert.equal(validateAuditoriaFilters({}).valid, true);
    assert.equal(
      validateAuditoriaFilters({ precio: ID, usuario: ID, relevamiento: ID, accion: "MODIFICACION", page: "2", limit: "10" })
        .valid,
      true,
    );
  });

  it("rejects malformed ids, unknown accion and bad pagination", () => {
    const result = validateAuditoriaFilters({ precio: "x", usuario: "y", accion: "BORRAR", page: "0", limit: "999" });

    assert.deepEqual(fields(result), ["accion", "limit", "page", "precio", "usuario"]);
  });

  it("rejects non-string values (query operators)", () => {
    assert.deepEqual(fields(validateAuditoriaFilters({ precio: { $ne: ID } })), ["precio"]);
  });
});
