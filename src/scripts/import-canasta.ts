import "dotenv/config";
import path from "node:path";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import { connectDB } from "../config/database.js";
import { buildCanasta } from "../domain/canasta.js";
import { parseRecursos, type Sheets } from "../domain/canasta-source.js";
import { CanastaNodo } from "../models/canasta-nodo.model.js";
import { importCanasta } from "../services/canasta-import.service.js";

const FILES = {
  ponderadores: "PONDERADORES.xlsx",
  diccionario: "DICCIONARIO_VARIEDADES.xlsx",
  tratamiento: "TRATAMIENTO_ESPECIAL.xlsx",
} as const;

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result ?? null;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return value;
}

async function readSheets(file: string): Promise<Sheets> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  const sheets: Sheets = {};
  workbook.eachSheet((worksheet) => {
    const rows: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      // ExcelJS values are 1-indexed: position 0 is always empty.
      rows.push((row.values as ExcelJS.CellValue[]).slice(1).map(cellValue));
    });
    sheets[worksheet.name] = rows;
  });

  return sheets;
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? process.env["CANASTA_RECURSOS_DIR"];
  if (!dir) {
    throw new Error("Pass the directory with the resource workbooks or set CANASTA_RECURSOS_DIR");
  }

  const [ponderadores, diccionario, tratamiento] = await Promise.all([
    readSheets(path.join(dir, FILES.ponderadores)),
    readSheets(path.join(dir, FILES.diccionario)),
    readSheets(path.join(dir, FILES.tratamiento)),
  ]);

  const build = buildCanasta(parseRecursos({ ponderadores, diccionario, tratamiento }));

  await connectDB();
  const result = await importCanasta(CanastaNodo, build.nodos);

  console.log(`Canasta imported: ${build.nodos.length} nodes`);
  console.log(`  created: ${result.created}, updated: ${result.updated}, unchanged: ${result.unchanged}`);
  console.log(`  derived nodes (missing in the spreadsheets): ${build.derivados.length}`);
  console.log(`  variedades without codigoVariedad12: ${build.advertencias.sinCodigoVariedad12.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
