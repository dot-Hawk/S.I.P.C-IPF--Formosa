import {
  ESTADOS_PRODUCTO,
  UNIDADES_PRODUCTO,
} from "../domain/enums.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const REQUIRED_FIELDS = ["nombre", "categoria", "unidad", "cantidadReferencia"] as const;
const REQUIRED_FIELDS_WITH_VARIEDAD = [...REQUIRED_FIELDS, "codigoVariedad"] as const;
const UPDATABLE_FIELDS = [...REQUIRED_FIELDS_WITH_VARIEDAD, "marca"] as const;
const VARIEDAD_CODIGO = /^\d{7}$/;

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function checkField(field: string, value: unknown, errors: ValidationError[]): void {
  if (field === "unidad") {
    if (!UNIDADES_PRODUCTO.some((u) => u === value)) {
      errors.push({ field, message: `unidad must be one of: ${UNIDADES_PRODUCTO.join(", ")}` });
    }
    return;
  }

  if (field === "codigoVariedad") {
    if (typeof value !== "string" || !VARIEDAD_CODIGO.test(value.trim())) {
      errors.push({ field, message: "codigoVariedad must be a 7 digit string" });
    }
    return;
  }

  if (field === "cantidadReferencia") {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      errors.push({ field, message: "cantidadReferencia must be a number greater than 0" });
    }
    return;
  }

  if (!isNonEmptyString(value)) {
    errors.push({ field, message: `${field} must be a non-empty string` });
  }
}

export function validateProductoCreate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of REQUIRED_FIELDS_WITH_VARIEDAD) {
    checkField(field, input[field], errors);
  }
  if (input["marca"] !== undefined) {
    checkField("marca", input["marca"], errors);
  }

  return result(errors);
}

export function validateProductoUpdate(input: Record<string, unknown>): ValidationResult {
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

export function validateProductoEstado(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ESTADOS_PRODUCTO.some((e) => e === input["estado"])) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_PRODUCTO.join(", ")}` });
  }

  return result(errors);
}

export function validateProductoFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { categoria, unidad, estado, codigoVariedad } = query;

  if (categoria !== undefined && !isNonEmptyString(categoria)) {
    errors.push({ field: "categoria", message: "categoria must be a non-empty string" });
  }
  if (unidad !== undefined && !UNIDADES_PRODUCTO.some((u) => u === unidad)) {
    errors.push({ field: "unidad", message: `unidad must be one of: ${UNIDADES_PRODUCTO.join(", ")}` });
  }
  if (estado !== undefined && !ESTADOS_PRODUCTO.some((e) => e === estado)) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_PRODUCTO.join(", ")}` });
  }

  if (codigoVariedad !== undefined) {
    checkField("codigoVariedad", codigoVariedad, errors);
  }

  return result(errors);
}
