import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relativosAncho, relativosCsv } from "./calculo-resultados.js";

const RELATIVOS = [
  { variedad: "1111102", mes: "2026-03", valor: 1.05 },
  { variedad: "1111101", mes: "2026-03", valor: 1.2 },
  { variedad: "1111101", mes: "2026-02", valor: 1.1 },
  { variedad: "1111102", mes: "2026-02", valor: null },
];

describe("relativosAncho", () => {
  it("pivots to one row per variedad and one column per month, both sorted", () => {
    assert.deepEqual(relativosAncho(RELATIVOS), [
      ["VARIEDAD", "2026-02", "2026-03"],
      ["1111101", 1.1, 1.2],
      ["1111102", null, 1.05],
    ]);
  });

  it("leaves a cell empty when the variedad has no relative for that month", () => {
    assert.deepEqual(
      relativosAncho([
        { variedad: "1111101", mes: "2026-02", valor: 1.1 },
        { variedad: "1111102", mes: "2026-03", valor: 1.2 },
      ]),
      [
        ["VARIEDAD", "2026-02", "2026-03"],
        ["1111101", 1.1, null],
        ["1111102", null, 1.2],
      ],
    );
  });

  it("is only the header column when there are no relatives", () => {
    assert.deepEqual(relativosAncho([]), [["VARIEDAD"]]);
  });
});

describe("relativosCsv", () => {
  it("writes the pivot with empty fields for the missing values", () => {
    assert.equal(
      relativosCsv(RELATIVOS),
      "VARIEDAD,2026-02,2026-03\r\n1111101,1.1,1.2\r\n1111102,,1.05\r\n",
    );
  });
});
