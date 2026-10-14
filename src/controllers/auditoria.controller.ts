import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type IPrecioAuditoria } from "../models/interfaces/IPrecioAuditoria.interface.js";
import { validateAuditoriaFilters } from "../validators/auditoria.validator.js";
import { DEFAULT_PAGE_SIZE } from "../validators/precio.validator.js";

const FILTER_FIELDS = ["precio", "usuario", "relevamiento", "accion"] as const;

export function createAuditoriaController(model: Model<IPrecioAuditoria>) {
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

      const entries = await model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json(entries);
    },
  };
}
