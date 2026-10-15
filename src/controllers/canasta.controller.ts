import { type Request, type Response } from "express";
import { NIVEL_VARIEDAD } from "../domain/enums.js";
import { type CanastaFilter, type CanastaRepository } from "../repositories/canasta.repository.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isCodigoCanasta, validateCanastaFilters } from "../validators/canasta.validator.js";

const NIVEL_PRODUCTO = NIVEL_VARIEDAD - 1;
const TEXT_FILTERS = ["padre", "categoria", "estado"] as const;
const OPTIONAL_FIELDS = ["codigoVariedad12", "tratamientoEspecial"] as const;

export function createCanastaController(canasta: CanastaRepository) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const validation = validateCanastaFilters(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const filter: Record<string, string | number> = {};
      const nivel = req.query["nivel"];
      if (typeof nivel === "string") filter["nivel"] = Number(nivel);
      for (const field of TEXT_FILTERS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value.trim();
      }

      res.json(await canasta.list(filter as CanastaFilter));
    },

    async getByCodigo(req: Request, res: Response): Promise<void> {
      const codigo = req.params["codigo"];
      if (!isCodigoCanasta(codigo)) {
        res.status(400).json({ message: "Invalid codigo" });
        return;
      }

      const nodo = await canasta.findByCodigo(codigo);
      if (!nodo) {
        res.status(404).json({ message: "Canasta node not found" });
        return;
      }

      res.json(nodo);
    },

    // Adds a variedad to the fixed basket (e.g. for special surveys). The structure above it is
    // never edited through the API.
    async createVariedad(req: Request, res: Response): Promise<void> {
      const { codigo, nombre, padre, categoria, ponderador } = req.body;

      const producto = await canasta.findByCodigo(padre);
      if (!producto || producto.nivel !== NIVEL_PRODUCTO || producto.estado !== "ACTIVO") {
        res.status(400).json({ message: "padre must be an existing active producto" });
        return;
      }

      const data: Record<string, unknown> = {
        codigo,
        nombre: nombre.trim(),
        nivel: NIVEL_VARIEDAD,
        padre,
        ponderador: ponderador ?? 0,
        derivado: false,
        estado: "ACTIVO",
        categoria,
      };
      for (const field of OPTIONAL_FIELDS) {
        if (req.body[field] !== undefined) data[field] = req.body[field];
      }

      try {
        res.status(201).json(await canasta.create(data as Parameters<CanastaRepository["create"]>[0]));
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ message: "A node with this codigo already exists" });
          return;
        }
        throw error;
      }
    },

    // "Removing" a variedad is deactivating it, so the price history keeps its meaning.
    async setEstado(req: Request, res: Response): Promise<void> {
      const codigo = req.params["codigo"];
      if (!isCodigoCanasta(codigo)) {
        res.status(400).json({ message: "Invalid codigo" });
        return;
      }

      const nodo = await canasta.setVariedadEstado(codigo, req.body.estado);
      if (!nodo) {
        res.status(404).json({ message: "Variedad not found" });
        return;
      }

      res.json(nodo);
    },
  };
}
