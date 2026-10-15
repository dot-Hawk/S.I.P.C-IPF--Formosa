import { csvField } from "./calculo-export.js";

export interface RelativoValor {
  variedad: string;
  mes: string;
  valor: number | null;
}

export type Celda = string | number | null;

// One row per variedad and one column per month, the shape of the planillas the team works with.
export function relativosAncho(relativos: RelativoValor[]): Celda[][] {
  const meses = [...new Set(relativos.map((r) => r.mes))].sort();
  const variedades = [...new Set(relativos.map((r) => r.variedad))].sort();
  const valores = new Map(relativos.map((r) => [`${r.variedad}|${r.mes}`, r.valor]));

  return [
    ["VARIEDAD", ...meses],
    ...variedades.map((variedad) => [variedad, ...meses.map((mes) => valores.get(`${variedad}|${mes}`) ?? null)]),
  ];
}

export function relativosCsv(relativos: RelativoValor[]): string {
  return (
    relativosAncho(relativos)
      .map((fila) => fila.map((celda) => (celda === null ? "" : csvField(celda))).join(","))
      .join("\r\n") + "\r\n"
  );
}
