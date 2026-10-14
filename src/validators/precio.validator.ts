import { isUuid } from "../utils/uuid.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const ID_FIELDS = ["relevamiento", "comercio", "producto"] as const;
const FILTER_ID_FIELDS = [...ID_FIELDS, "encuestador"] as const;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const MAX_OBSERVACION_LENGTH = 500;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function checkId(field: string, value: unknown, errors: ValidationError[]): void {
  if (!isUuid(value)) {
    errors.push({ field, message: `${field} must be a valid id` });
  }
}

function checkValor(value: unknown, errors: ValidationError[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push({ field: "valor", message: "valor must be a number greater than 0" });
  }
}

function checkObservacion(value: unknown, errors: ValidationError[]): void {
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_OBSERVACION_LENGTH) {
    errors.push({
      field: "observacion",
      message: `observacion must be a non-empty string of at most ${MAX_OBSERVACION_LENGTH} characters`,
    });
  }
}

function checkOferta(value: unknown, errors: ValidationError[]): void {
  if (typeof value !== "boolean") {
    errors.push({ field: "oferta", message: "oferta must be a boolean" });
  }
}

function checkConfirmarDesvio(value: unknown, errors: ValidationError[]): void {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push({ field: "confirmarDesvio", message: "confirmarDesvio must be a boolean" });
  }
}

function checkFecha(value: unknown, now: Date, errors: ValidationError[]): void {
  const parsed = typeof value === "string" && ISO_DATE_PREFIX.test(value) ? Date.parse(value) : NaN;

  if (Number.isNaN(parsed)) {
    errors.push({ field: "fechaRelevamiento", message: "fechaRelevamiento must be an ISO 8601 date" });
  } else if (parsed > now.getTime()) {
    errors.push({ field: "fechaRelevamiento", message: "fechaRelevamiento cannot be in the future" });
  }
}

export function validatePrecioCreate(
  input: Record<string, unknown>,
  now: Date = new Date(),
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of ID_FIELDS) {
    checkId(field, input[field], errors);
  }
  checkValor(input["valor"], errors);
  if (input["fechaRelevamiento"] !== undefined) checkFecha(input["fechaRelevamiento"], now, errors);
  if (input["observacion"] !== undefined) checkObservacion(input["observacion"], errors);
  if (input["oferta"] !== undefined) checkOferta(input["oferta"], errors);
  checkConfirmarDesvio(input["confirmarDesvio"], errors);

  return result(errors);
}

export function validatePrecioUpdate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { valor, observacion, oferta } = input;

  if (valor === undefined && observacion === undefined && oferta === undefined) {
    errors.push({ field: "body", message: "at least one of: valor, observacion, oferta is required" });
  }
  if (valor !== undefined) checkValor(valor, errors);
  if (observacion !== undefined) checkObservacion(observacion, errors);
  if (oferta !== undefined) checkOferta(oferta, errors);
  checkConfirmarDesvio(input["confirmarDesvio"], errors);

  return result(errors);
}

export function validatePrecioFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of FILTER_ID_FIELDS) {
    if (query[field] !== undefined) checkId(field, query[field], errors);
  }

  const { page, limit, oferta, conAlerta } = query;
  if (oferta !== undefined && oferta !== "true" && oferta !== "false") {
    errors.push({ field: "oferta", message: "oferta must be true or false" });
  }
  if (conAlerta !== undefined && conAlerta !== "true") {
    errors.push({ field: "conAlerta", message: "conAlerta must be true" });
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

  return result(errors);
}
