import { type TipoComercio } from "./enums.js";

export type TipoInformante = "SUPER" | "TRAD";

export interface PrecioFila {
  periodo: string;
  oferta: boolean;
  valor: number;
  codigoVariedad: string;
  comercio: string;
  tipoComercio: TipoComercio;
}

export interface NodoVariedad {
  codigo: string;
  codigoVariedad12: string | null;
  tratamientoEspecial: boolean;
  // Ancestors in the basket, from the closest (producto) to the farthest (division).
  ancestros: string[];
}

export interface EngineObservacion {
  variedad: string;
  informante: string;
  tipo: TipoInformante;
  mes: string;
  precio: number;
}

export interface EngineVariedad {
  codigo: string;
  grupos: string[];
  tratamientoEspecial: boolean;
}

const PERIODO = /^(\d{4}-(0[1-9]|1[0-2]))(-Q[12])?$/;
// Lengths of the prefixes of the 12-division code that form its hierarchy, besides the code itself.
const PREFIX_LENGTHS = [6, 5, 4, 3, 1];

// A relevamiento is monthly ("2026-10") or biweekly ("2026-10-Q1"): the series is monthly.
export function mesDePeriodo(periodo: string): string {
  const match = PERIODO.exec(periodo);
  if (!match) throw new Error(`periodo inválido: ${periodo}`);
  return match[1] as string;
}

export function tipoInformante(tipo: TipoComercio): TipoInformante {
  return tipo === "SUPERMERCADO" ? "SUPER" : "TRAD";
}

// One observation per variedad, commerce and month: the mean of every price taken in it, which
// covers several visits (biweekly relevamientos) and several brands of the same variedad.
export function buildObservaciones(
  filas: PrecioFila[],
  options: { excluirOfertas: boolean },
): EngineObservacion[] {
  const sums = new Map<string, { sum: number; count: number; observacion: Omit<EngineObservacion, "precio"> }>();

  for (const fila of filas) {
    if (options.excluirOfertas && fila.oferta) continue;

    const mes = mesDePeriodo(fila.periodo);
    const key = `${fila.codigoVariedad}|${fila.comercio}|${mes}`;
    const entry = sums.get(key) ?? {
      sum: 0,
      count: 0,
      observacion: {
        variedad: fila.codigoVariedad,
        informante: fila.comercio,
        tipo: tipoInformante(fila.tipoComercio),
        mes,
      },
    };
    entry.sum += fila.valor;
    entry.count += 1;
    sums.set(key, entry);
  }

  return [...sums.values()]
    .map(({ sum, count, observacion }) => ({ ...observacion, precio: sum / count }))
    .sort(
      (a, b) =>
        a.variedad.localeCompare(b.variedad) ||
        a.informante.localeCompare(b.informante) ||
        a.mes.localeCompare(b.mes),
    );
}

export function gruposDesdeCodigo12(codigo12: string): string[] {
  const grupos = [codigo12, ...PREFIX_LENGTHS.filter((n) => n < codigo12.length).map((n) => codigo12.slice(0, n))];
  return [...new Set(grupos)];
}

// The imputation hierarchy follows the 12-division classification. Variedades that have no code in
// it use the basket's own hierarchy instead; the prefix keeps both families of groups apart.
export function buildVariedades(nodos: NodoVariedad[]): EngineVariedad[] {
  return nodos.map((nodo) => ({
    codigo: nodo.codigo,
    grupos: nodo.codigoVariedad12
      ? gruposDesdeCodigo12(nodo.codigoVariedad12)
      : nodo.ancestros.map((codigo) => `C:${codigo}`),
    tratamientoEspecial: nodo.tratamientoEspecial,
  }));
}

export interface NodoCanasta {
  codigo: string;
  nivel: number;
  padre: string | null;
  codigoVariedad12: string | null;
  tratamientoEspecial: boolean | null;
}

// The variedades of the basket with their ancestors (producto up to division, without the root).
export function nodosVariedad(nodos: NodoCanasta[], nivelVariedad = 6): NodoVariedad[] {
  const porCodigo = new Map(nodos.map((n) => [n.codigo, n]));

  return nodos
    .filter((n) => n.nivel === nivelVariedad)
    .map((n) => {
      const ancestros: string[] = [];
      let actual = n.padre === null ? undefined : porCodigo.get(n.padre);
      while (actual && actual.nivel > 0) {
        ancestros.push(actual.codigo);
        actual = actual.padre === null ? undefined : porCodigo.get(actual.padre);
      }
      return {
        codigo: n.codigo,
        codigoVariedad12: n.codigoVariedad12,
        tratamientoEspecial: n.tratamientoEspecial ?? false,
        ancestros,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export function rangoMeses(mesBase: string, mesObjetivo: string): string[] {
  const meses: string[] = [];
  let year = Number(mesBase.slice(0, 4));
  let month = Number(mesBase.slice(5, 7));

  for (;;) {
    const mes = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    if (mes > mesObjetivo) return meses;
    meses.push(mes);
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
  }
}
