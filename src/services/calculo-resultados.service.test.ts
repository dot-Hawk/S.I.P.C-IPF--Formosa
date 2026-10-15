import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildResultadosWorkbook } from "./calculo-resultados.service.js";

describe("buildResultadosWorkbook", () => {
  it("writes the run, its relatives (pivoted) and its imputations", async () => {
    const buffer = await buildResultadosWorkbook({
      calculo: {
        id: "calc-1",
        mesBase: "2026-01",
        mesObjetivo: "2026-03",
        excluirOfertas: false,
        motorVersion: "0.1.0",
        entradaHash: "abc",
        parametros: { esperarMeses: 2, pesoSuper: 0.25, pesoTrad: 0.75, omitirGruposCompletos: true },
        createdAt: new Date("2026-10-14T12:00:00Z"),
      },
      relativos: [
        { variedad: "1111101", mes: "2026-02", valor: 1.1, nSuper: 1, nTrad: 2 },
        { variedad: "1111101", mes: "2026-03", valor: 1.2, nSuper: 1, nTrad: 2 },
      ],
      imputaciones: [
        { variedad: "1111101", comercio: "c-2", mes: "2026-03", precio: 220, nivel: 0, grupo: "1111101", factor: 1.1 },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const row = (sheet: string, n: number) => (workbook.getWorksheet(sheet)?.getRow(n).values as unknown[]).slice(1);
    assert.deepEqual(row("Relativos", 1), ["VARIEDAD", "2026-02", "2026-03"]);
    assert.deepEqual(row("Relativos", 2), ["1111101", 1.1, 1.2]);
    assert.deepEqual(row("Imputaciones", 1), ["VARIEDAD", "INFORMANTE", "MES", "PRECIO", "NIVEL", "GRUPO", "FACTOR"]);
    assert.deepEqual(row("Imputaciones", 2), ["1111101", "c-2", "2026-03", 220, 0, "1111101", 1.1]);

    const corrida = workbook.getWorksheet("Corrida");
    const values = new Map<string, unknown>();
    corrida?.eachRow((r) => values.set(String(r.getCell(1).value), r.getCell(2).value));
    assert.equal(values.get("mesBase"), "2026-01");
    assert.equal(values.get("motorVersion"), "0.1.0");
    assert.equal(values.get("entradaHash"), "abc");
    assert.equal(values.get("pesoSuper"), 0.25);
  });
});
