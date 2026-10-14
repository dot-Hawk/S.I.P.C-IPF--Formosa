import { type Request, type Response } from "express";
import { type AuditoriaFilter, type AuditoriaRepository } from "../repositories/auditoria.repository.js";
import { validateAuditoriaFilters } from "../validators/auditoria.validator.js";
import { DEFAULT_PAGE_SIZE } from "../validators/precio.validator.js";

const FILTER_FIELDS = ["precio", "usuario", "relevamiento", "accion"] as const;

export function createAuditoriaController(auditoria: AuditoriaRepository) {
  return {
    async listPrecios(req: Request, res: Response): Promise<void> {
      const validation = validateAuditoriaFilters(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const filter: Record<string, string> = {};
      for (const field of FILTER_FIELDS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value;
      }

      const limit = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : DEFAULT_PAGE_SIZE;
      const page = typeof req.query["page"] === "string" ? Number(req.query["page"]) : 1;

      res.json(await auditoria.listPrecios(filter as AuditoriaFilter, { limit, offset: (page - 1) * limit }));
    },
  };
}
