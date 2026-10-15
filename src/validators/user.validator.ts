import { ESTADOS_USUARIO, ROLES } from "../domain/enums.js";
import { type ValidationError, type ValidationResult } from "./validation.js";

const REQUIRED_TEXT_FIELDS = ["nombre", "apellido", "dni", "legajo"] as const;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function validateUserInput(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push({ field, message: `${field} is required and must be a non-empty string` });
    }
  }

  const { email, password, role } = input;

  if (typeof email !== "string" || !EMAIL_FORMAT.test(email.trim())) {
    errors.push({ field: "email", message: "email is required and must be a valid email address" });
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: "password",
      message: `password is required and must have at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }

  if (!ROLES.some((r) => r === role)) {
    errors.push({ field: "role", message: `role must be one of: ${ROLES.join(", ")}` });
  }

  return { valid: errors.length === 0, errors };
}

const EDITABLE_FIELDS = ["nombre", "apellido", "dni", "legajo", "email", "role"] as const;
const TEXT_FIELDS = ["nombre", "apellido", "dni", "legajo"] as const;

function result(errors: ValidationError[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

// Partial: only what is sent changes. The estado and the password have their own endpoints.
export function validateUserUpdate(input: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!EDITABLE_FIELDS.some((field) => input[field] !== undefined)) {
    return result([{ field: "body", message: `send at least one of: ${EDITABLE_FIELDS.join(", ")}` }]);
  }

  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
      errors.push({ field, message: `${field} must be a non-empty string` });
    }
  }

  const { email, role } = input;
  if (email !== undefined && (typeof email !== "string" || !EMAIL_FORMAT.test(email.trim()))) {
    errors.push({ field: "email", message: "email must be a valid email address" });
  }
  if (role !== undefined && !ROLES.some((r) => r === role)) {
    errors.push({ field: "role", message: `role must be one of: ${ROLES.join(", ")}` });
  }

  return result(errors);
}

export function validateUserEstado(input: Record<string, unknown>): ValidationResult {
  if (!ESTADOS_USUARIO.some((e) => e === input["estado"])) {
    return result([{ field: "estado", message: `estado must be one of: ${ESTADOS_USUARIO.join(", ")}` }]);
  }
  return result([]);
}

function passwordError(field: string, value: unknown): ValidationError[] {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH
    ? []
    : [{ field, message: `${field} is required and must have at least ${MIN_PASSWORD_LENGTH} characters` }];
}

export function validatePasswordReset(input: Record<string, unknown>): ValidationResult {
  return result(passwordError("password", input["password"]));
}

export function validatePasswordChange(input: Record<string, unknown>): ValidationResult {
  const errors = passwordError("newPassword", input["newPassword"]);
  if (typeof input["currentPassword"] !== "string" || input["currentPassword"] === "") {
    errors.unshift({ field: "currentPassword", message: "currentPassword is required" });
  }
  return result(errors);
}

export function validateUserFilters(query: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const { role, estado } = query;

  if (role !== undefined && !ROLES.some((r) => r === role)) {
    errors.push({ field: "role", message: `role must be one of: ${ROLES.join(", ")}` });
  }
  if (estado !== undefined && !ESTADOS_USUARIO.some((e) => e === estado)) {
    errors.push({ field: "estado", message: `estado must be one of: ${ESTADOS_USUARIO.join(", ")}` });
  }

  return result(errors);
}
