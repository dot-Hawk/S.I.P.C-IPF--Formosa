import { ROLES } from "../domain/enums.js";
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
