import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransition, canCancel } from "./asignacion.rules.js";

describe("canTransition", () => {
  it("allows PENDIENTE -> EN_CURSO and EN_CURSO -> COMPLETADA", () => {
    assert.equal(canTransition("PENDIENTE", "EN_CURSO"), true);
    assert.equal(canTransition("EN_CURSO", "COMPLETADA"), true);
  });

  it("rejects skipping, going backwards, repeating and leaving COMPLETADA", () => {
    assert.equal(canTransition("PENDIENTE", "COMPLETADA"), false);
    assert.equal(canTransition("EN_CURSO", "PENDIENTE"), false);
    assert.equal(canTransition("PENDIENTE", "PENDIENTE"), false);
    assert.equal(canTransition("COMPLETADA", "EN_CURSO"), false);
  });
});

describe("canCancel", () => {
  it("allows cancelling PENDIENTE and EN_CURSO only", () => {
    assert.equal(canCancel("PENDIENTE"), true);
    assert.equal(canCancel("EN_CURSO"), true);
    assert.equal(canCancel("COMPLETADA"), false);
    assert.equal(canCancel("CANCELADA"), false);
  });

  it("makes CANCELADA terminal and unreachable through canTransition", () => {
    for (const to of ["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"] as const) {
      assert.equal(canTransition("CANCELADA", to), false);
    }
    assert.equal(canTransition("PENDIENTE", "CANCELADA"), true);
    assert.equal(canTransition("EN_CURSO", "CANCELADA"), true);
    assert.equal(canTransition("COMPLETADA", "CANCELADA"), false);
  });
});
