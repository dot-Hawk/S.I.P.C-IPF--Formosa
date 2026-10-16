import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateRelevamientoInput } from "./relevamiento.validator.js";

const FECHAS = { fechaInicio: "2026-10-01", fechaLimite: "2026-10-31" };

describe("validateRelevamientoInput", () => {
  it("accepts a monthly periodo with MENSUAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10", frecuencia: "MENSUAL", ...FECHAS });
    assert.deepEqual(result, { valid: true, errors: [] });
  });

  it("accepts a biweekly periodo with QUINCENAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10-Q2", frecuencia: "QUINCENAL", ...FECHAS });
    assert.deepEqual(result, { valid: true, errors: [] });
  });

  it("rejects a biweekly periodo with MENSUAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10-Q1", frecuencia: "MENSUAL", ...FECHAS });
    assert.equal(result.valid, false);
    assert.equal(result.errors[0]?.field, "periodo");
  });

  it("rejects a monthly periodo with QUINCENAL frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10", frecuencia: "QUINCENAL", ...FECHAS });
    assert.equal(result.valid, false);
  });

  it("rejects an out-of-range month", () => {
    const result = validateRelevamientoInput({ periodo: "2026-13", frecuencia: "MENSUAL", ...FECHAS });
    assert.equal(result.valid, false);
  });

  it("rejects an invalid quincena", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10-Q3", frecuencia: "QUINCENAL", ...FECHAS });
    assert.equal(result.valid, false);
  });

  it("rejects an unknown frecuencia", () => {
    const result = validateRelevamientoInput({ periodo: "2026-10", frecuencia: "SEMANAL", ...FECHAS });
    assert.equal(result.valid, false);
    assert.equal(result.errors[0]?.field, "frecuencia");
  });

  it("rejects missing fields", () => {
    const result = validateRelevamientoInput({});
    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((e) => e.field).sort(),
      ["fechaInicio", "fechaLimite", "frecuencia", "periodo"],
    );
  });

  it("rejects non-string values", () => {
    const result = validateRelevamientoInput({ periodo: 202610, frecuencia: "MENSUAL", ...FECHAS });
    assert.equal(result.valid, false);
  });

  describe("fechas", () => {
    const base = { periodo: "2026-10", frecuencia: "MENSUAL" };
    const fieldsOf = (input: Record<string, unknown>) =>
      validateRelevamientoInput({ ...base, ...input }).errors.map((e) => e.field);

    it("accepts date-only and full ISO date strings", () => {
      assert.deepEqual(validateRelevamientoInput({ ...base, ...FECHAS }), { valid: true, errors: [] });
      const result = validateRelevamientoInput({
        ...base,
        fechaInicio: "2026-10-01T00:00:00.000Z",
        fechaLimite: "2026-10-31T23:59:59-03:00",
      });
      assert.equal(result.valid, true);
    });

    it("requires both dates", () => {
      assert.deepEqual(fieldsOf({}), ["fechaInicio", "fechaLimite"]);
      assert.deepEqual(fieldsOf({ fechaInicio: "2026-10-01" }), ["fechaLimite"]);
    });

    it("rejects non-string dates", () => {
      assert.deepEqual(fieldsOf({ fechaInicio: 1790812800000, fechaLimite: null }), ["fechaInicio", "fechaLimite"]);
    });

    it("rejects invalid dates, including impossible calendar days", () => {
      assert.deepEqual(fieldsOf({ fechaInicio: "not-a-date", fechaLimite: "2026-13-01" }), ["fechaInicio", "fechaLimite"]);
      assert.deepEqual(fieldsOf({ fechaInicio: "2026-02-31", fechaLimite: "2026-03-31" }), ["fechaInicio"]);
      assert.deepEqual(fieldsOf({ fechaInicio: "10/01/2026", fechaLimite: "2026-10-31" }), ["fechaInicio"]);
    });

    it("rejects an inverted range", () => {
      const result = validateRelevamientoInput({ ...base, fechaInicio: "2026-10-31", fechaLimite: "2026-10-01" });
      assert.equal(result.valid, false);
      assert.equal(result.errors[0]?.field, "fechaLimite");
    });

    it("rejects equal dates", () => {
      assert.deepEqual(fieldsOf({ fechaInicio: "2026-10-01", fechaLimite: "2026-10-01" }), ["fechaLimite"]);
    });
  });
});
