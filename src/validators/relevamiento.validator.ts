import { type ValidationError, type ValidationResult } from "./validation.js";

const FRECUENCIAS = ["QUINCENAL", "MENSUAL"] as const;

const PERIODO_FORMAT = {
  MENSUAL: /^\d{4}-(0[1-9]|1[0-2])$/,
  QUINCENAL: /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/,
} as const;

export function validateRelevamientoInput(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { periodo, frecuencia } = input;

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

  return { valid: errors.length === 0, errors };
}
