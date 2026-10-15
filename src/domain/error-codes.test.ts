import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ERROR_CODES } from "./error-codes.js";

describe("ERROR_CODES", () => {
  it("are UPPER_SNAKE_CASE and unique", () => {
    const values = Object.values(ERROR_CODES);

    for (const value of values) assert.match(value, /^[A-Z]+(_[A-Z]+)*$/);
    assert.equal(new Set(values).size, values.length);
  });

  it("keeps the public values stable", () => {
    assert.deepEqual(ERROR_CODES, {
      RELEVAMIENTO_NOT_ABIERTO: "RELEVAMIENTO_NOT_ABIERTO",
      COMERCIO_ALREADY_ASSIGNED: "COMERCIO_ALREADY_ASSIGNED",
      INVALID_ESTADO_TRANSITION: "INVALID_ESTADO_TRANSITION",
      ASIGNACION_CONCURRENT_MODIFICATION: "ASIGNACION_CONCURRENT_MODIFICATION",
      ASIGNACION_NOT_PENDIENTE: "ASIGNACION_NOT_PENDIENTE",
      ASIGNACION_NOT_CANCELABLE: "ASIGNACION_NOT_CANCELABLE",
      USER_DUPLICATE: "USER_DUPLICATE",      LAST_COORDINADOR: "LAST_COORDINADOR",
    });
  });
});
