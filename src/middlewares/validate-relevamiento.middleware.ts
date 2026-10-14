import { type NextFunction, type Request, type Response } from "express";
import { validateRelevamientoInput } from "../validators/relevamiento.validator.js";

export function validateRelevamiento(req: Request, res: Response, next: NextFunction): void {
  const result = validateRelevamientoInput(req.body ?? {});

  if (!result.valid) {
    res.status(400).json({ errors: result.errors });
    return;
  }

  next();
}
