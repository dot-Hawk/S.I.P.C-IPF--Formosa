import ExcelJS from "exceljs";
import { type Calculo, type CalculoImputacion, type CalculoRelativo } from "../db/schema.js";
import { relativosAncho } from "../domain/calculo-resultados.js";

export interface ResultadosCalculo {
  calculo: Pick<
    Calculo,
    "id" | "mesBase" | "mesObjetivo" | "excluirOfertas" | "motorVersion" | "entradaHash" | "parametros" | "createdAt"
  >;
  relativos: Pick<CalculoRelativo, "variedad" | "mes" | "valor" | "nSuper" | "nTrad">[];
  imputaciones: Pick<CalculoImputacion, "variedad" | "comercio" | "mes" | "precio" | "nivel" | "grupo" | "factor">[];
}

// The planilla of a run: what was calculated and with what, so the file explains itself.
export async function buildResultadosWorkbook({ calculo, relativos, imputaciones }: ResultadosCalculo): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const hojaRelativos = workbook.addWorksheet("Relativos");
  for (const fila of relativosAncho(relativos)) hojaRelativos.addRow(fila);

  const hojaImputaciones = workbook.addWorksheet("Imputaciones");
  hojaImputaciones.addRow(["VARIEDAD", "INFORMANTE", "MES", "PRECIO", "NIVEL", "GRUPO", "FACTOR"]);
  for (const i of imputaciones) {
    hojaImputaciones.addRow([i.variedad, i.comercio, i.mes, i.precio, i.nivel, i.grupo, i.factor]);
  }

  const corrida = workbook.addWorksheet("Corrida");
  const datos: [string, string | number | boolean | null][] = [
    ["id", calculo.id],
    ["mesBase", calculo.mesBase],
    ["mesObjetivo", calculo.mesObjetivo],
    ["excluirOfertas", calculo.excluirOfertas],
    ["motorVersion", calculo.motorVersion ?? null],
    ["entradaHash", calculo.entradaHash],
    ["esperarMeses", calculo.parametros.esperarMeses],
    ["pesoSuper", calculo.parametros.pesoSuper],
    ["pesoTrad", calculo.parametros.pesoTrad],
    ["omitirGruposCompletos", calculo.parametros.omitirGruposCompletos],
    ["ejecutadoEn", calculo.createdAt.toISOString()],
  ];
  for (const fila of datos) corrida.addRow(fila);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
