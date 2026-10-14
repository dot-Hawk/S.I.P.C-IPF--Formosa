import { type NextFunction, type Request, type Response } from "express";
import { verifyToken } from "../auth/token.service.js";

export const AUTH_LOCALS_KEY = "auth";

export function createAuthenticate(secret: string) {
  return function authenticate(req: Request, res: Response, next: NextFunction): void {
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

    res.locals[AUTH_LOCALS_KEY] = payload;
    next();
  };
}
