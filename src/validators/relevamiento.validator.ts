import { type ValidationError, type ValidationResult } from "./validation.js";

const FRECUENCIAS = ["QUINCENAL", "MENSUAL"] as const;

const PERIODO_FORMAT = {
  MENSUAL: /^\d{4}-(0[1-9]|1[0-2])$/,
  QUINCENAL: /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/,
} as const;

// Date-only or full ISO 8601 (`2026-10-01`, `2026-10-01T00:00:00Z`, with offset or without).
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

// Null when it is not a real ISO date; `new Date` alone would roll 2026-02-31 over to March.
function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = ISO_DATE.exec(value);
  if (!match) return null;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function validateRelevamientoInput(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { periodo, frecuencia, fechaInicio, fechaLimite } = input;

  const frecuenciaValida = FRECUENCIAS.find((f) => f === frecuencia);
  if (!frecuenciaValida) {
    errors.push({
      field: "frecuencia",
      message: `frecuencia must be one of: ${FRECUENCIAS.join(", ")}`,
    });
  }

  if (typeof periodo !== "string") {
    errors.push({ field: "periodo", message: "periodo is required and must be a string" });
  } else if (frecuenciaValida && !PERIODO_FORMAT[frecuenciaValida].test(periodo)) {
    errors.push({
      field: "periodo",
      message: `periodo does not match the format required by ${frecuenciaValida}`,
    });
  }

  const inicio = parseIsoDate(fechaInicio);
  const limite = parseIsoDate(fechaLimite);

  if (inicio === null) {
    errors.push({ field: "fechaInicio", message: "fechaInicio is required and must be a valid ISO date" });
  }
  if (limite === null) {
    errors.push({ field: "fechaLimite", message: "fechaLimite is required and must be a valid ISO date" });
  } else if (inicio !== null && limite <= inicio) {
    errors.push({ field: "fechaLimite", message: "fechaLimite must be after fechaInicio" });
  }

  return { valid: errors.length === 0, errors };
}
