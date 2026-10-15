import { type NextFunction, type Request, type Response } from "express";

const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  "entity.parse.failed": "Malformed JSON body",
  "entity.too.large": "Request body is too large",
};

function getClientErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;

  const status = "status" in error ? error.status : undefined;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: "Route not found" });
}

// Never exposes error details or stack traces to the client.
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const clientStatus = getClientErrorStatus(error);
  if (clientStatus !== null) {
    const type = typeof error === "object" && error !== null && "type" in error ? String(error.type) : "";
    res.status(clientStatus).json({ message: CLIENT_ERROR_MESSAGES[type] ?? "Invalid request" });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error" });
}
