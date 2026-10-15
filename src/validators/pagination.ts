import { type Page } from "../repositories/precio.repository.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./precio.validator.js";
import { type ValidationError } from "./validation.js";

const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function validatePagination(query: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const { page, limit } = query;

  if (page !== undefined && !(typeof page === "string" && POSITIVE_INTEGER.test(page))) {
    errors.push({ field: "page", message: "page must be a positive integer" });
  }
  if (
    limit !== undefined &&
    !(typeof limit === "string" && POSITIVE_INTEGER.test(limit) && Number(limit) <= MAX_PAGE_SIZE)
  ) {
    errors.push({ field: "limit", message: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}` });
  }

  return errors;
}

// Call it after validatePagination.
export function parsePage(query: Record<string, unknown>): Page {
  const limit = typeof query["limit"] === "string" ? Number(query["limit"]) : DEFAULT_PAGE_SIZE;
  const page = typeof query["page"] === "string" ? Number(query["page"]) : 1;
  return { limit, offset: (page - 1) * limit };
}
