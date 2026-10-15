const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;

  // Drizzle wraps the driver error and keeps the SQLSTATE in `cause`.
  return sqlState((error as { cause?: unknown }).cause);
}

export function isUniqueViolation(error: unknown): boolean {
  return sqlState(error) === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return sqlState(error) === FOREIGN_KEY_VIOLATION;
}
