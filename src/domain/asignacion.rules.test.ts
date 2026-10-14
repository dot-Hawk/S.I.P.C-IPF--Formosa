import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "./asignacion.rules.js";

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
