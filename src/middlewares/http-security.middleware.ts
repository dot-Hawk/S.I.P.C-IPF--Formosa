import cors from "cors";
import { type RequestHandler } from "express";
import helmet from "helmet";

// CORS_ORIGINS is a comma separated list of the origins that may call the API from a browser.
export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "");
}

// Security headers (helmet) and an explicit CORS allowlist. With no origins configured the API
// answers no cross-origin permission at all, which is the safe default.
export function createHttpSecurity(origins: string[]): RequestHandler[] {
  return [
    helmet(),
    cors({
      origin: origins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Authorization", "Content-Type"],
      // So a browser client can read the file name of a download, the login retry delay and the
      // total of a paginated list.
      exposedHeaders: ["Content-Disposition", "Retry-After", "X-Total-Count"],
      maxAge: 600,
    }),
  ];
}
