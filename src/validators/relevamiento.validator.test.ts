import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateRelevamientoInput } from "./relevamiento.validator.js";

describe("validateRelevamientoInput", () => {
  it("accepts a monthly periodo with MENSUAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10", frecuencia: "MENSUAL" });
    assert.deepEqual(result, { valid: true, errors: [] });
  });

  it("accepts a biweekly periodo with QUINCENAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10-Q2", frecuencia: "QUINCENAL" });
    assert.deepEqual(result, { valid: true, errors: [] });
  });

  it("rejects a biweekly periodo with MENSUAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10-Q1", frecuencia: "MENSUAL" });
    assert.equal(result.valid, false);
    assert.equal(result.errors[0]?.field, "periodo");
  });

  it("rejects a monthly periodo with QUINCENAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10", frecuencia: "QUINCENAL" });
    assert.equal(result.valid, false);
  });

  it("rejects an out-of-range month", () => {
    const result = validateRelevamientoInput({ periodo: "2026-13", frecuencia: "MENSUAL" });
    assert.equal(result.valid, false);
  });

  it("rejects an invalid quincena", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10-Q3", frecuencia: "QUINCENAL" });
    assert.equal(result.valid, false);
  });

  it("rejects an unknown frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10", frecuencia: "SEMANAL" });
    assert.equal(result.valid, false);
    assert.equal(result.errors[0]?.field, "frecuencia");
  });

  it("rejects missing fields", () => {
    const result = validateRelevamientoInput({});
    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((e) => e.field).sort(),
      ["frecuencia", "periodo"],
    );
  });

  it("rejects non-string values", () => {
    const result = validateRelevamientoInput({ periodo: 202610, frecuencia: "MENSUAL" });
    assert.equal(result.valid, false);
  });
});
