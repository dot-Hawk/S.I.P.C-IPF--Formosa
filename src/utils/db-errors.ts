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

function uniqueDetail(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const detail = (error as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;

  return uniqueDetail((error as { cause?: unknown }).cause);
}

// Columns of the key that collided, read from the driver's `Key (col, ...)=(...)` detail. The
// constraint stays the source of truth; this only tells the caller which fields to blame.
export function uniqueViolationColumns(error: unknown): string[] {
  const match = /^Key \(([^)]+)\)=/.exec(uniqueDetail(error) ?? "");
  return match?.[1] ? match[1].split(",").map((column) => column.trim()) : [];
}
