const DUPLICATE_KEY_ERROR_CODE = 11000;

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === DUPLICATE_KEY_ERROR_CODE
  );
}

export function isMongooseValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === "ValidationError";
}
