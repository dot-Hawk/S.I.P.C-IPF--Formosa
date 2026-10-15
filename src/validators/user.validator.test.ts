import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePasswordChange, validatePasswordReset, validateUserEstado, validateUserInput, validateUserUpdate } from "./user.validator.js";

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

describe("validateUserUpdate", () => {
  it("accepts any subset of the editable fields", () => {
    assert.equal(validateUserUpdate({ nombre: "Ana" }).valid, true);
    assert.equal(validateUserUpdate({ email: "ana@example.com", role: "ANALISTA", legajo: "L-9" }).valid, true);
  });

  it("rejects an empty update and fields it must not take", () => {
    assert.deepEqual(fieldsOf(validateUserUpdate({})), ["body"]);
    assert.deepEqual(fieldsOf(validateUserUpdate({ estado: "INACTIVO", password: "x" })), ["body"]);
  });

  it("rejects blank text, a bad email and an unknown role", () => {
    assert.deepEqual(
      fieldsOf(validateUserUpdate({ nombre: " ", email: "nope", role: "ROOT" })).sort(),
      ["email", "nombre", "role"],
    );
  });
});

describe("validateUserEstado", () => {
  it("accepts the three states and rejects anything else", () => {
    for (const estado of ["ACTIVO", "INACTIVO", "LICENCIA"]) assert.equal(validateUserEstado({ estado }).valid, true);
    assert.deepEqual(fieldsOf(validateUserEstado({ estado: "BORRADO" })), ["estado"]);
    assert.deepEqual(fieldsOf(validateUserEstado({})), ["estado"]);
  });
});

describe("password validators", () => {
  it("reset needs a password of at least 8 characters", () => {
    assert.equal(validatePasswordReset({ password: "long-enough" }).valid, true);
    assert.deepEqual(fieldsOf(validatePasswordReset({ password: "short" })), ["password"]);
  });

  it("change needs the current password and a new one of at least 8 characters", () => {
    assert.equal(validatePasswordChange({ currentPassword: "old", newPassword: "long-enough" }).valid, true);
    assert.deepEqual(fieldsOf(validatePasswordChange({ newPassword: "short" })).sort(), ["currentPassword", "newPassword"]);
  });
});

function fieldsOf(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field);
}
