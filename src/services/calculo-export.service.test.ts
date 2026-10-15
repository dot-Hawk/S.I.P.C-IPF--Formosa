import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildExportWorkbook } from "./calculo-export.service.js";

describe("buildExportWorkbook", () => {
  it("writes the Precios and Variedades sheets the engine reads", async () => {
    const buffer = await buildExportWorkbook(
      [{ variedad: "1111101", informante: "c-1", tipo: "TRAD", mes: "2026-01", precio: 100.5 }],
      [{ codigo: "1111101", grupos: ["A0111111", "A01111"], tratamientoEspecial: false }],
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const precios = workbook.getWorksheet("Precios");
    const variedades = workbook.getWorksheet("Variedades");
    assert.deepEqual((precios?.getRow(1).values as unknown[]).slice(1), ["VARIEDAD", "INFORMANTE", "TIPO", "MES", "PRECIO"]);
    assert.deepEqual((precios?.getRow(2).values as unknown[]).slice(1), ["1111101", "c-1", "TRAD", "2026-01", 100.5]);
    assert.deepEqual((variedades?.getRow(1).values as unknown[]).slice(1), [
      "VARIEDAD",
      "GRUPO_1",
      "GRUPO_2",
      "TRATAMIENTO_ESPECIAL",
    ]);
    assert.deepEqual((variedades?.getRow(2).values as unknown[]).slice(1), ["1111101", "A0111111", "A01111", "NO"]);
  });
});
