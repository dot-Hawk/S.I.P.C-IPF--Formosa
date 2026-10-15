import ExcelJS from "exceljs";
import { PRECIOS_COLUMNAS, variedadesTabla } from "../domain/calculo-export.js";
import { type EngineObservacion, type EngineVariedad } from "../domain/calculo-input.js";

// The workbook the engine reads (`POST /v1/calculo/excel`): sheets `Precios` and `Variedades`.
export async function buildExportWorkbook(
  observaciones: EngineObservacion[],
  variedades: EngineVariedad[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const precios = workbook.addWorksheet("Precios");
  precios.addRow([...PRECIOS_COLUMNAS]);
  for (const o of observaciones) precios.addRow([o.variedad, o.informante, o.tipo, o.mes, o.precio]);

  const hoja = workbook.addWorksheet("Variedades");
  for (const row of variedadesTabla(variedades)) hoja.addRow(row);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
