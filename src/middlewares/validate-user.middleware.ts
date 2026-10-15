import { type NextFunction, type Request, type Response } from "express";
import { validateUserInput } from "../validators/user.validator.js";

export function validateUser(req: Request, res: Response, next: NextFunction): void {
  const result = validateUserInput(req.body ?? {});

  if (!result.valid) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  next();
}
