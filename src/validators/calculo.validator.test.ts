import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCalculoExportQuery, validateCalculoCreate, validateRelativosFilters } from "./calculo.validator.js";

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field).sort();
}

describe("validateCalculoCreate", () => {
  const valid = { mesBase: "2026-01", mesObjetivo: "2026-10" };

  it("accepts the minimal body, the same month and every optional field", () => {
    assert.equal(validateCalculoCreate(valid).valid, true);
    assert.equal(validateCalculoCreate({ mesBase: "2026-01", mesObjetivo: "2026-01" }).valid, true);
    assert.equal(
      validateCalculoCreate({
        ...valid,
        excluirOfertas: true,
        parametros: { esperarMeses: 3, pesoSuper: 0.3, pesoTrad: 0.7, omitirGruposCompletos: false },
      }).valid,
      true,
    );
  });

  it("requires both months in AAAA-MM", () => {
    assert.deepEqual(fields(validateCalculoCreate({})), ["mesBase", "mesObjetivo"]);
    assert.deepEqual(fields(validateCalculoCreate({ ...valid, mesBase: "2026-13" })), ["mesBase"]);
    assert.deepEqual(fields(validateCalculoCreate({ ...valid, mesObjetivo: "octubre" })), ["mesObjetivo"]);
  });

  it("rejects a target before the base and absurdly long ranges", () => {
    assert.deepEqual(fields(validateCalculoCreate({ mesBase: "2026-10", mesObjetivo: "2026-01" })), ["mesObjetivo"]);
    assert.deepEqual(fields(validateCalculoCreate({ mesBase: "2010-01", mesObjetivo: "2026-01" })), ["mesObjetivo"]);
  });

  it("validates the optional fields", () => {
    assert.deepEqual(fields(validateCalculoCreate({ ...valid, excluirOfertas: "si" })), ["excluirOfertas"]);
    assert.deepEqual(fields(validateCalculoCreate({ ...valid, parametros: "x" })), ["parametros"]);
    assert.deepEqual(
      fields(validateCalculoCreate({ ...valid, parametros: { esperarMeses: -1, pesoSuper: -1, pesoTrad: "a" } })),
      ["parametros.esperarMeses", "parametros.pesoSuper", "parametros.pesoTrad"],
    );
  });
});

describe("validateRelativosFilters", () => {
  it("accepts no filters and valid ones", () => {
    assert.equal(validateRelativosFilters({}).valid, true);
    assert.equal(validateRelativosFilters({ variedad: "1111101", mes: "2026-10" }).valid, true);
  });

  it("rejects malformed values", () => {
    assert.deepEqual(fields(validateRelativosFilters({ variedad: "abc", mes: "x" })), ["mes", "variedad"]);
  });
});

describe("validateCalculoExportQuery", () => {
  const valid = { mesBase: "2026-01", mesObjetivo: "2026-10" };

  it("accepts the range alone and the optional flags as strings", () => {
    assert.equal(validateCalculoExportQuery(valid).valid, true);
    assert.equal(
      validateCalculoExportQuery({ ...valid, excluirOfertas: "false", formato: "csv" }).valid,
      true,
    );
    assert.equal(validateCalculoExportQuery({ ...valid, formato: "xlsx" }).valid, true);
  });

  it("rejects a bad range, flag or format", () => {
    assert.deepEqual(fields(validateCalculoExportQuery({ mesBase: "enero", mesObjetivo: "2026-10" })), ["mesBase"]);
    assert.deepEqual(fields(validateCalculoExportQuery({ ...valid, mesObjetivo: "2025-12" })), ["mesObjetivo"]);
    assert.deepEqual(fields(validateCalculoExportQuery({ ...valid, excluirOfertas: "yes" })), ["excluirOfertas"]);
    assert.deepEqual(fields(validateCalculoExportQuery({ ...valid, formato: "pdf" })), ["formato"]);
  });
});
