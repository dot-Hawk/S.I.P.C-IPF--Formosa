import {
  CATEGORIAS_CANASTA,
  NIVEL_VARIEDAD,
  type CategoriaCanasta,
} from "../models/interfaces/ICanastaNodo.interface.js";

export interface RawNodo {
  codigo: string;
  nombre: string;
  nivel: number;
  ponderador: number;
  // Only variedades carry their explicit ancestors in the source sheet.
  producto?: string;
  subclase?: string;
  clase?: string;
  grupo?: string;
  division?: string;
}

export interface CanastaSource {
  nodos: RawNodo[];
  categorias: Record<CategoriaCanasta, string[]>;
  // variedad codigo -> 12 digit code used by the calculation engine
  codigos12: Record<string, string>;
  tratamientoEspecial: string[];
}

export interface CanastaNodoData {
  codigo: string;
  nombre: string;
  nivel: number;
  padre: string | null;
  ponderador: number;
  derivado: boolean;
  estado: "ACTIVO";
  categoria?: CategoriaCanasta;
  codigoVariedad12?: string;
  tratamientoEspecial?: boolean;
}

export interface CanastaBuild {
  nodos: CanastaNodoData[];
  // codigos of producto nodes that were missing in the source and rebuilt from their variedades
  derivados: string[];
  advertencias: { sinCodigoVariedad12: string[] };
}

const ROOT_CODIGO = "0";
const NIVEL_PRODUCTO = NIVEL_VARIEDAD - 1;
const DERIVED_NOMBRE = "Sin denominación";

interface Ancestor {
  codigo: string;
  nivel: number;
}

// Ancestors of a variedad from the closest (producto) to the farthest (division). The source
// states them explicitly; when a cell is empty the code prefix is used instead.
function ancestorsOf(raw: RawNodo): Ancestor[] {
  const chain = [
    raw.producto ?? raw.codigo.slice(0, 5),
    raw.subclase ?? raw.codigo.slice(0, 4),
    raw.clase ?? raw.codigo.slice(0, 3),
    raw.grupo ?? raw.codigo.slice(0, 2),
    raw.division ?? raw.codigo.slice(0, 1),
  ];

  return chain.map((codigo, index) => ({ codigo, nivel: NIVEL_PRODUCTO - index }));
}

function parentOf(raw: RawNodo): string | null {
  if (raw.nivel === 0) return null;
  if (raw.nivel === 1) return ROOT_CODIGO;
  if (raw.nivel === NIVEL_VARIEDAD) return ancestorsOf(raw)[0]?.codigo ?? null;
  return raw.codigo.slice(0, -1);
}

function toVariedadSet(codes: string[], label: (code: string) => string, known: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const code of codes) {
    if (!known.has(code)) throw new Error(label(code));
    result.add(code);
  }
  return result;
}

// Builds the basket tree from the rows of the official spreadsheets, validating that it is
// consistent (unique codes, existing parents, one categoria per variedad). The producto level
// has holes in the source: those nodes are rebuilt from the variedades hanging from them.
export function buildCanasta(source: CanastaSource): CanastaBuild {
  const byCodigo = new Map<string, CanastaNodoData>();
  const rawByCodigo = new Map<string, RawNodo>();

  for (const raw of source.nodos) {
    if (rawByCodigo.has(raw.codigo)) throw new Error(`duplicated codigo: ${raw.codigo}`);
    if (!Number.isInteger(raw.nivel) || raw.nivel < 0 || raw.nivel > NIVEL_VARIEDAD) {
      throw new Error(`invalid nivel ${raw.nivel} for ${raw.codigo}`);
    }
    if (!Number.isFinite(raw.ponderador) || raw.ponderador < 0) {
      throw new Error(`invalid ponderador ${raw.ponderador} for ${raw.codigo}`);
    }
    rawByCodigo.set(raw.codigo, raw);
    byCodigo.set(raw.codigo, {
      codigo: raw.codigo,
      nombre: raw.nombre,
      nivel: raw.nivel,
      padre: parentOf(raw),
      ponderador: raw.ponderador,
      derivado: false,
      estado: "ACTIVO",
    });
  }

  // The source has holes in the intermediate levels: rebuild the missing ancestors of each
  // variedad, weighing them by the variedades hanging from them.
  const derivados: string[] = [];
  for (const raw of source.nodos) {
    if (raw.nivel !== NIVEL_VARIEDAD) continue;

    const chain = ancestorsOf(raw);
    chain.forEach((ancestor, index) => {
      const padre = chain[index + 1]?.codigo ?? ROOT_CODIGO;
      let node = byCodigo.get(ancestor.codigo);

      if (!node) {
        node = {
          codigo: ancestor.codigo,
          nombre: DERIVED_NOMBRE,
          nivel: ancestor.nivel,
          padre,
          ponderador: 0,
          derivado: true,
          estado: "ACTIVO",
        };
        byCodigo.set(ancestor.codigo, node);
        derivados.push(ancestor.codigo);
      }

      if (node.derivado) node.ponderador += raw.ponderador;
    });
  }

  for (const node of byCodigo.values()) {
    if (node.padre === null) continue;
    const parent = byCodigo.get(node.padre);
    if (!parent) throw new Error(`parent ${node.padre} of ${node.codigo} not found`);
    if (parent.nivel !== node.nivel - 1) {
      throw new Error(`parent ${node.padre} of ${node.codigo} has unexpected nivel ${parent.nivel}`);
    }
  }

  const variedades = new Set(
    [...byCodigo.values()].filter((n) => n.nivel === NIVEL_VARIEDAD).map((n) => n.codigo),
  );

  const categoriaOf = new Map<string, CategoriaCanasta>();
  for (const categoria of CATEGORIAS_CANASTA) {
    for (const codigo of source.categorias[categoria]) {
      if (!variedades.has(codigo)) {
        throw new Error(`categoria ${categoria} references unknown variedad ${codigo}`);
      }
      if (categoriaOf.has(codigo)) throw new Error(`variedad ${codigo} is in more than one categoria`);
      categoriaOf.set(codigo, categoria);
    }
  }

  const especiales = toVariedadSet(
    source.tratamientoEspecial,
    (code) => `tratamiento especial ${code} is not a variedad`,
    variedades,
  );

  const sinCodigoVariedad12: string[] = [];
  for (const codigo of variedades) {
    const node = byCodigo.get(codigo);
    if (!node) continue;

    const categoria = categoriaOf.get(codigo);
    if (!categoria) throw new Error(`variedad ${codigo} has no categoria`);

    node.categoria = categoria;
    node.tratamientoEspecial = especiales.has(codigo);

    const codigo12 = source.codigos12[codigo];
    if (codigo12) node.codigoVariedad12 = codigo12;
    else sinCodigoVariedad12.push(codigo);
  }

  return { nodos: [...byCodigo.values()], derivados, advertencias: { sinCodigoVariedad12 } };
}
