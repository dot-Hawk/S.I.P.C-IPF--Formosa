import { ESTADOS_ASIGNACION } from "../domain/enums.js";
import { isUuid } from "../utils/uuid.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const ID_FIELDS = ["relevamiento", "encuestador", "comercio"] as const;

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function checkId(field: string, value: unknown, errors: ValidationError[]): void {
  if (!isUuid(value)) {
    errors.push({ field, message: `${field} must be a valid id` });
  }
}

export function validateAsignacionCreate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of ID_FIELDS) {
    checkId(field, input[field], errors);
  }

  return result(errors);
}

export function validateAsignacionReassign(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  checkId("encuestador", input["encuestador"], errors);

  return result(errors);
}

export function validateAsignacionEstado(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ESTADOS_ASIGNACION.some((e) => e === input["estado"])) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_ASIGNACION.join(", ")}` });
  }

  return result(errors);
}

export function validateAsignacionFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of ID_FIELDS) {
    if (query[field] !== undefined) checkId(field, query[field], errors);
  }
  if (query["estado"] !== undefined && !ESTADOS_ASIGNACION.some((e) => e === query["estado"])) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_ASIGNACION.join(", ")}` });
  }

  return result(errors);
}
