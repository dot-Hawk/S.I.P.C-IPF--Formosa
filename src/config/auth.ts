import { type SignOptions } from "jsonwebtoken";

export interface AuthConfig {
  secret: string;
  expiresIn: NonNullable<SignOptions["expiresIn"]>;
}

const DEFAULT_EXPIRES_IN = "8h";

export function getAuthConfig(): AuthConfig {
  const secret = process.env["JWT_SECRET"];

  if (!secret) {
    throw new Error("JWT_SECRET is not defined in the environment");
  }

  const expiresIn = (process.env["JWT_EXPIRES_IN"] ?? DEFAULT_EXPIRES_IN) as AuthConfig["expiresIn"];

  return { secret, expiresIn };
}
