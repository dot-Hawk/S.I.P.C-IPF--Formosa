import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isForeignKeyViolation, isUniqueViolation, uniqueViolationColumns } from "./db-errors.js";

// Drizzle wraps the driver error: the SQLSTATE code lives in `cause`.
const wrapped = (code: string) => Object.assign(new Error("Failed query"), { cause: { code } });

describe("db errors", () => {
  it("recognizes a unique violation, wrapped or raw", () => {
    assert.equal(isUniqueViolation(wrapped("23505")), true);
    assert.equal(isUniqueViolation(Object.assign(new Error("x"), { code: "23505" })), true);
  });

  it("recognizes a foreign key violation", () => {
    assert.equal(isForeignKeyViolation(wrapped("23503")), true);
  });

  it("does not confuse other errors", () => {
    assert.equal(isUniqueViolation(wrapped("23503")), false);
    assert.equal(isForeignKeyViolation(wrapped("23505")), false);
    assert.equal(isUniqueViolation(new Error("boom")), false);
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation("23505"), false);
  });
});

describe("uniqueViolationColumns", () => {
  const unique = (extra: object) => Object.assign(new Error("Failed query"), { cause: { code: "23505", ...extra } });

  it("reads the column from the key detail", () => {
    assert.deepEqual(uniqueViolationColumns(unique({ detail: "Key (dni)=(30) already exists." })), ["dni"]);
  });

  it("reads several columns of a composite key", () => {
    const detail = "Key (relevamiento_id, comercio_id)=(a, b) already exists.";
    assert.deepEqual(uniqueViolationColumns(unique({ detail })), ["relevamiento_id", "comercio_id"]);
  });

  it("is empty when the detail is not available", () => {
    assert.deepEqual(uniqueViolationColumns(unique({})), []);
    assert.deepEqual(uniqueViolationColumns(new Error("boom")), []);
  });
});
