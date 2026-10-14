import {
  CATEGORIAS_CANASTA,
  ESTADOS_CANASTA,
} from "../models/interfaces/ICanastaNodo.interface.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const VARIEDAD_CODIGO = /^\d{7}$/;
const PRODUCTO_CODIGO = /^\d{5}$/;
const ANY_CODIGO = /^\d{1,7}$/;

export function isCodigoCanasta(value: unknown): value is string {
  return typeof value === "string" && ANY_CODIGO.test(value);
}

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function validateVariedadCreate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { codigo, nombre, padre, categoria, ponderador, codigoVariedad12, tratamientoEspecial } = input;

  if (typeof codigo !== "string" || !VARIEDAD_CODIGO.test(codigo)) {
    errors.push({ field: "codigo", message: "codigo must be a 7 digit string" });
  }
  if (!isNonEmptyString(nombre)) {
    errors.push({ field: "nombre", message: "nombre must be a non-empty string" });
  }
  if (typeof padre !== "string" || !PRODUCTO_CODIGO.test(padre)) {
    errors.push({ field: "padre", message: "padre must be the 5 digit codigo of a producto" });
  }
  if (!CATEGORIAS_CANASTA.some((c) => c === categoria)) {
    errors.push({ field: "categoria", message: `categoria must be one of: ${CATEGORIAS_CANASTA.join(", ")}` });
  }
  if (ponderador !== undefined && (typeof ponderador !== "number" || !Number.isFinite(ponderador) || ponderador < 0)) {
    errors.push({ field: "ponderador", message: "ponderador must be a number greater than or equal to 0" });
  }
  if (codigoVariedad12 !== undefined && !isNonEmptyString(codigoVariedad12)) {
    errors.push({ field: "codigoVariedad12", message: "codigoVariedad12 must be a non-empty string" });
  }
  if (tratamientoEspecial !== undefined && typeof tratamientoEspecial !== "boolean") {
    errors.push({ field: "tratamientoEspecial", message: "tratamientoEspecial must be a boolean" });
  }

  return result(errors);
}

export function validateCanastaEstado(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ESTADOS_CANASTA.some((e) => e === input["estado"])) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_CANASTA.join(", ")}` });
  }

  return result(errors);
}

export function validateCanastaFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { nivel, padre, categoria, estado } = query;

  if (nivel !== undefined && !(typeof nivel === "string" && /^[0-6]$/.test(nivel))) {
    errors.push({ field: "nivel", message: "nivel must be an integer between 0 and 6" });
  }
  if (padre !== undefined && !(typeof padre === "string" && isCodigoCanasta(padre.trim()))) {
    errors.push({ field: "padre", message: "padre must be a numeric codigo" });
  }
  if (categoria !== undefined && !CATEGORIAS_CANASTA.some((c) => c === categoria)) {
    errors.push({ field: "categoria", message: `categoria must be one of: ${CATEGORIAS_CANASTA.join(", ")}` });
  }
  if (estado !== undefined && !ESTADOS_CANASTA.some((e) => e === estado)) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_CANASTA.join(", ")}` });
  }

  return result(errors);
}
