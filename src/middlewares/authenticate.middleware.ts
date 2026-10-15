import { type NextFunction, type Request, type Response } from "express";
import { verifyToken } from "../auth/token.service.js";
import { type UserRepository } from "../repositories/user.repository.js";

export const AUTH_LOCALS_KEY = "auth";

// The token proves who the caller is; the database says whether they may still act and in what
// role. So deactivating a user or changing their role takes effect on their very next request,
// not when their token expires.
export function createAuthenticate(secret: string, users: Pick<UserRepository, "findById">) {
  return async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const [scheme, token] = req.headers.authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = verifyToken(token, secret);
    if (!payload) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const user = await users.findById(payload.userId);
    if (!user || user.estado !== "ACTIVO") {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    res.locals[AUTH_LOCALS_KEY] = { userId: user.id, role: user.role };
    next();
  };
}
