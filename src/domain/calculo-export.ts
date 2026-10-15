import { type EngineObservacion, type EngineVariedad } from "./calculo-input.js";

export const PRECIOS_COLUMNAS = ["VARIEDAD", "INFORMANTE", "TIPO", "MES", "PRECIO"] as const;

export function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The prices sheet of the engine's Excel format, as CSV (comma separated, dot decimals).
export function preciosCsv(observaciones: EngineObservacion[]): string {
  const lines = [
    PRECIOS_COLUMNAS.join(","),
    ...observaciones.map((o) =>
      [o.variedad, o.informante, o.tipo, o.mes, o.precio].map(csvField).join(","),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}

// The Variedades sheet: the imputation hierarchy as GRUPO_1 (finest) .. GRUPO_n (broadest).
export function variedadesTabla(variedades: EngineVariedad[]): string[][] {
  const width = Math.max(0, ...variedades.map((v) => v.grupos.length));
  const grupos = Array.from({ length: width }, (_, i) => `GRUPO_${i + 1}`);

  return [
    ["VARIEDAD", ...grupos, "TRATAMIENTO_ESPECIAL"],
    ...variedades.map((v) => [
      v.codigo,
      ...Array.from({ length: width }, (_, i) => v.grupos[i] ?? ""),
      v.tratamientoEspecial ? "SI" : "NO",
    ]),
  ];
}
