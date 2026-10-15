import { type NextFunction, type Request, type Response } from "express";
import { type AuthPayload } from "../auth/token.service.js";
import { type Role } from "../models/interfaces/IUser.interface.js";
import { AUTH_LOCALS_KEY } from "./authenticate.middleware.js";

export function authorize(...allowedRoles: Role[]) {
  return function authorizeRoles(_req: Request, res: Response, next: NextFunction): void {
    const auth = res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;

    if (!auth) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(auth.role)) {
      res.status(403).json({ message: "You do not have permission to perform this action" });
      return;
    }

    next();
  };
}
