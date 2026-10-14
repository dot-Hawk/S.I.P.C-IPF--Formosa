import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePrecioCreate, validatePrecioFilters, validatePrecioUpdate } from "./precio.validator.js";

const ID = "00000000-0000-4000-8000-000000000011";
const NOW = new Date("2026-10-14T12:00:00Z");
const VALID = { relevamiento: ID, comercio: ID, producto: ID, valor: 1250.5 };

function fields(result: { errors: { field: string }[] }): string[] {
  return result.errors.map((e) => e.field).sort();
}

describe("validatePrecioCreate", () => {
  it("accepts a minimal and a full precio", () => {
    assert.equal(validatePrecioCreate(VALID, NOW).valid, true);
    assert.equal(
      validatePrecioCreate(
        { ...VALID, fechaRelevamiento: "2026-10-13", observacion: "Oferta de la semana" },
        NOW,
      ).valid,
      true,
    );
  });

  it("rejects malformed ids", () => {
    const result = validatePrecioCreate({ ...VALID, relevamiento: "x", producto: undefined }, NOW);

    assert.deepEqual(fields(result), ["producto", "relevamiento"]);
  });

  it("rejects non-positive, non-finite and non-number valor", () => {
    for (const bad of [0, -5, Infinity, NaN, "10"]) {
      assert.deepEqual(fields(validatePrecioCreate({ ...VALID, valor: bad }, NOW)), ["valor"]);
    }
  });

  it("rejects a future or malformed fechaRelevamiento", () => {
    assert.deepEqual(fields(validatePrecioCreate({ ...VALID, fechaRelevamiento: "2026-10-15" }, NOW)), [
      "fechaRelevamiento",
    ]);
    assert.deepEqual(fields(validatePrecioCreate({ ...VALID, fechaRelevamiento: "ayer" }, NOW)), [
      "fechaRelevamiento",
    ]);
  });

  it("rejects a blank or oversized observacion", () => {
    assert.deepEqual(fields(validatePrecioCreate({ ...VALID, observacion: "  " }, NOW)), ["observacion"]);
    assert.deepEqual(fields(validatePrecioCreate({ ...VALID, observacion: "x".repeat(501) }, NOW)), [
      "observacion",
    ]);
  });
});

describe("validatePrecioUpdate", () => {
  it("accepts valor and/or observacion", () => {
    assert.equal(validatePrecioUpdate({ valor: 10 }).valid, true);
    assert.equal(validatePrecioUpdate({ observacion: "ok" }).valid, true);
  });

  it("rejects an empty update and ignores fields that cannot change", () => {
    assert.deepEqual(fields(validatePrecioUpdate({})), ["body"]);
    assert.deepEqual(fields(validatePrecioUpdate({ producto: ID, encuestador: ID })), ["body"]);
  });

  it("validates the fields present", () => {
    assert.deepEqual(fields(validatePrecioUpdate({ valor: -1 })), ["valor"]);
  });
});

describe("validatePrecioFilters", () => {
  it("accepts no filters, valid ids and valid pagination", () => {
    assert.equal(validatePrecioFilters({}).valid, true);
    assert.equal(
      validatePrecioFilters({ relevamiento: ID, encuestador: ID, page: "2", limit: "200" }).valid,
      true,
    );
  });

  it("rejects bad ids and out-of-range pagination", () => {
    const result = validatePrecioFilters({ comercio: { $ne: ID }, page: "0", limit: "201" });

    assert.deepEqual(fields(result), ["comercio", "limit", "page"]);
  });
});

describe("oferta", () => {
  const VALID = { relevamiento: ID, comercio: ID, producto: ID, valor: 100 };

  it("accepts a boolean oferta on create and rejects anything else", () => {
    assert.equal(validatePrecioCreate({ ...VALID, oferta: true }).valid, true);
    assert.equal(validatePrecioCreate({ ...VALID, oferta: "si" }).valid, false);
  });

  it("accepts an update that only changes oferta", () => {
    assert.equal(validatePrecioUpdate({ oferta: false }).valid, true);
    assert.equal(validatePrecioUpdate({ oferta: 1 }).valid, false);
  });

  it("accepts the oferta filter only as true or false", () => {
    assert.equal(validatePrecioFilters({ oferta: "true" }).valid, true);
    assert.equal(validatePrecioFilters({ oferta: "false" }).valid, true);
    assert.equal(validatePrecioFilters({ oferta: "yes" }).valid, false);
  });
});

describe("confirmarDesvio and conAlerta", () => {
  const VALID = { relevamiento: ID, comercio: ID, producto: ID, valor: 100 };

  it("accepts a boolean confirmarDesvio and rejects anything else", () => {
    assert.equal(validatePrecioCreate({ ...VALID, confirmarDesvio: true }).valid, true);
    assert.equal(validatePrecioCreate({ ...VALID, confirmarDesvio: "si" }).valid, false);
    assert.equal(validatePrecioUpdate({ valor: 5, confirmarDesvio: false }).valid, true);
    assert.equal(validatePrecioUpdate({ valor: 5, confirmarDesvio: 1 }).valid, false);
  });

  it("an update with only confirmarDesvio changes nothing, so it is rejected", () => {
    assert.equal(validatePrecioUpdate({ confirmarDesvio: true }).valid, false);
  });

  it("accepts conAlerta only as true", () => {
    assert.equal(validatePrecioFilters({ conAlerta: "true" }).valid, true);
    assert.equal(validatePrecioFilters({ conAlerta: "false" }).valid, false);
  });
});
