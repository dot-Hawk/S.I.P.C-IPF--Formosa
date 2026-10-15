import { ACCIONES_AUDITORIA } from "../domain/enums.js";
import { isUuid } from "../utils/uuid.js";
import { MAX_PAGE_SIZE } from "./precio.validator.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const ID_FILTERS = ["precio", "usuario", "relevamiento"] as const;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function validateAuditoriaFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of ID_FILTERS) {
    if (query[field] !== undefined && !isUuid(query[field])) {
      errors.push({ field, message: `${field} must be a valid id` });
    }
  }

  const { accion, page, limit } = query;
  if (accion !== undefined && !ACCIONES_AUDITORIA.some((a) => a === accion)) {
    errors.push({ field: "accion", message: `accion must be one of: ${ACCIONES_AUDITORIA.join(", ")}` });
  }
  if (page !== undefined && !(typeof page === "string" && POSITIVE_INTEGER.test(page))) {
    errors.push({ field: "page", message: "page must be a positive integer" });
  }
  if (
    limit !== undefined &&
    !(typeof limit === "string" && POSITIVE_INTEGER.test(limit) && Number(limit) <= MAX_PAGE_SIZE)
  ) {
    errors.push({ field: "limit", message: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}` });
  }

  return { valid: errors.length === 0, errors };
}
