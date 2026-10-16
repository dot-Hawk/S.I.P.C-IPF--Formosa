import { type Request, type Response } from "express";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isUuid } from "../utils/uuid.js";
import { parsePage, validatePagination } from "../validators/pagination.js";

export function createRelevamientoController(relevamientos: RelevamientoRepository) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      const { periodo, frecuencia, fechaInicio, fechaLimite } = req.body;

      try {
        const relevamiento = await relevamientos.create({
          periodo,
          frecuencia,
          fechaInicio: new Date(fechaInicio),
          fechaLimite: new Date(fechaLimite),
          estado: "ABIERTO",
        });
        res.status(201).json(relevamiento);
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ message: "A relevamiento already exists for this periodo and frecuencia" });
          return;
        }
        throw error;
      }
    },

    // Returns every row unless page or limit is given; X-Total-Count is always the full total.
    async list(req: Request, res: Response): Promise<void> {
      const errors = validatePagination(req.query);
      if (errors.length > 0) {
        res.status(400).json({ errors });
        return;
      }

      const paged = req.query["page"] !== undefined || req.query["limit"] !== undefined;
      const [found, total] = await Promise.all([
        relevamientos.list(paged ? parsePage(req.query) : undefined),
        relevamientos.count(),
      ]);
      res.setHeader("X-Total-Count", String(total));
      res.json(found);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid relevamiento id" });
        return;
      }

      const relevamiento = await relevamientos.findById(id);
      if (!relevamiento) {
        res.status(404).json({ message: "Relevamiento not found" });
        return;
      }

      res.json(relevamiento);
    },

    async close(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid relevamiento id" });
        return;
      }

      const closed = await relevamientos.closeIfOpen(id);
      if (closed) {
        res.json(closed);
        return;
      }

      if (await relevamientos.findById(id)) {
        res.status(409).json({ message: "Relevamiento is already closed" });
        return;
      }

      res.status(404).json({ message: "Relevamiento not found" });
    },
  };
}
