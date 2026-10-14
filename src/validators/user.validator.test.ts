import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateUserInput } from "./user.validator.js";

const VALID = {
  nombre: "Ana",
  apellido: "Perez",
  dni: "30123456",
  legajo: "L-100",
  email: "ana@example.com",
  password: "long-enough-password",
  role: "ANALISTA",
};

function fieldsWithErrors(input: Record<string, unknown>): string[] {
  return validateUserInput(input).errors.map((e) => e.field);
}

describe("validateUserInput", () => {
  it("accepts a valid user", () => {
    assert.deepEqual(validateUserInput(VALID), { valid: true, errors: [] });
  });

  it("rejects missing or blank required text fields", () => {
    const fields = fieldsWithErrors({ ...VALID, nombre: "   ", dni: undefined });

    assert.deepEqual(fields.sort(), ["dni", "nombre"]);
  });

  it("rejects an invalid email", () => {
    assert.deepEqual(fieldsWithErrors({ ...VALID, email: "not-an-email" }), ["email"]);
  });

  it("rejects a short password", () => {
    assert.deepEqual(fieldsWithErrors({ ...VALID, password: "short" }), ["password"]);
  });

  it("rejects an unknown role", () => {
    assert.deepEqual(fieldsWithErrors({ ...VALID, role: "ROOT" }), ["role"]);
  });

  it("rejects non-string values", () => {
    assert.deepEqual(fieldsWithErrors({ ...VALID, legajo: 42, email: 1 }).sort(), ["email", "legajo"]);
  });
});
