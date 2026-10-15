import { type NextFunction, type Request, type Response } from "express";
import { type ValidationResult } from "../validators/validation.js";

export function validateBody(validator: (input: Record<string, unknown>) => ValidationResult) {
  return function validateRequestBody(req: Request, res: Response, next: NextFunction): void {
    const result = validator(req.body ?? {});

    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    next();
  };
}
