import jwt, { type SignOptions } from "jsonwebtoken";
import { ROLES, type Role } from "../domain/enums.js";

export interface AuthPayload {
  userId: string;
  role: Role;
}

const ALGORITHM = "HS256";

export function signToken(
  payload: AuthPayload,
  secret: string,
  expiresIn: NonNullable<SignOptions["expiresIn"]>,
): string {
  return jwt.sign({ userId: payload.userId, role: payload.role }, secret, {
    algorithm: ALGORITHM,
    expiresIn,
  });
}

export function verifyToken(token: string, secret: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    if (typeof decoded === "string") return null;

    const { userId, role } = decoded;
    const roleValida = ROLES.find((r) => r === role);
    if (typeof userId !== "string" || !roleValida) return null;

    return { userId, role: roleValida };
  } catch {
    return null;
  }
}
