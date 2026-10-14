import { ESTADOS_COMERCIO, TIPOS_COMERCIO } from "../domain/enums.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const TEXT_FIELDS = ["nombre", "direccion", "zona"] as const;
const UPDATABLE_FIELDS = [...TEXT_FIELDS, "tipo"] as const;

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function checkField(field: string, value: unknown, errors: ValidationError[]): void {
  if (field === "tipo") {
    if (!TIPOS_COMERCIO.some((t) => t === value)) {
      errors.push({ field, message: `tipo must be one of: ${TIPOS_COMERCIO.join(", ")}` });
    }
    return;
  }

  if (!isNonEmptyString(value)) {
    errors.push({ field, message: `${field} must be a non-empty string` });
  }
}

export function validateComercioCreate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of UPDATABLE_FIELDS) {
    checkField(field, input[field], errors);
  }

  return result(errors);
}

export function validateComercioUpdate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const present = UPDATABLE_FIELDS.filter((field) => input[field] !== undefined);

  if (present.length === 0) {
    errors.push({
      field: "body",
      message: `at least one of: ${UPDATABLE_FIELDS.join(", ")} is required`,
    });
  }

  for (const field of present) {
    checkField(field, input[field], errors);
  }

  return result(errors);
}

export function validateComercioEstado(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ESTADOS_COMERCIO.some((e) => e === input["estado"])) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_COMERCIO.join(", ")}` });
  }

  return result(errors);
}

export function validateComercioFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { zona, tipo, estado } = query;

  if (zona !== undefined && !isNonEmptyString(zona)) {
    errors.push({ field: "zona", message: "zona must be a non-empty string" });
  }
  if (tipo !== undefined && !TIPOS_COMERCIO.some((t) => t === tipo)) {
    errors.push({ field: "tipo", message: `tipo must be one of: ${TIPOS_COMERCIO.join(", ")}` });
  }
  if (estado !== undefined && !ESTADOS_COMERCIO.some((e) => e === estado)) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_COMERCIO.join(", ")}` });
  }

  return result(errors);
}
