import { type CategoriaCanasta } from "./enums.js";
import { type CanastaSource, type RawNodo } from "./canasta.js";

export type SheetRows = unknown[][];
export type Sheets = Record<string, SheetRows>;

export interface RecursosSheets {
  ponderadores: Sheets;
  diccionario: Sheets;
  tratamiento: Sheets;
}

const CATEGORIA_SHEETS: Record<CategoriaCanasta, string> = {
  NUCLEO: "Núcleo",
  ESTACIONAL: "Estacionales",
  REGULADO: "Regulados",
};

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function sheet(sheets: Sheets, name: string): SheetRows {
  const rows = sheets[name];
  if (!rows) throw new Error(`sheet ${name} not found`);
  return rows;
}

function codesOf(rows: SheetRows, skipHeader: boolean): string[] {
  return rows
    .slice(skipHeader ? 1 : 0)
    .map((row) => text(row[0]))
    .filter((code) => code !== "");
}

function toNodo(row: unknown[]): RawNodo {
  const nodo: RawNodo = {
    codigo: text(row[0]),
    nombre: text(row[1]),
    nivel: Number(text(row[2])),
    ponderador: Number(text(row[3])),
  };

  const ancestors = [
    ["producto", row[4]],
    ["subclase", row[5]],
    ["clase", row[6]],
    ["grupo", row[7]],
    ["division", row[8]],
  ] as const;
  for (const [field, value] of ancestors) {
    if (text(value) !== "") nodo[field] = text(value);
  }

  return nodo;
}

// Translates the rows of the official resource workbooks (PONDERADORES, DICCIONARIO_VARIEDADES,
// TRATAMIENTO_ESPECIAL) into the input of buildCanasta. Reading the files is left to the caller.
export function parseRecursos({ ponderadores, diccionario, tratamiento }: RecursosSheets): CanastaSource {
  const nodos = sheet(ponderadores, "IPN_Va_VApon")
    .slice(1)
    .filter((row) => text(row[0]) !== "")
    .map(toNodo);

  const categorias = {} as Record<CategoriaCanasta, string[]>;
  for (const [categoria, name] of Object.entries(CATEGORIA_SHEETS) as [CategoriaCanasta, string][]) {
    categorias[categoria] = codesOf(sheet(ponderadores, name), true);
  }

  const codigos12: Record<string, string> = {};
  for (const row of sheet(diccionario, "Hoja1").slice(1)) {
    const variedad = text(row[0]);
    const codigo12 = text(row[1]);
    if (variedad !== "" && codigo12 !== "") codigos12[variedad] = codigo12;
  }

  const tratamientoEspecial = Object.values(tratamiento).flatMap((rows) => codesOf(rows, false));

  return { nodos, categorias, codigos12, tratamientoEspecial };
}
