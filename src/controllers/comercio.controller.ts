import { type Request, type Response } from "express";
import {
  type ComercioChanges,
  type ComercioFilter,
  type ComercioRepository,
} from "../repositories/comercio.repository.js";
import { isUuid } from "../utils/uuid.js";
import { validateComercioFilters } from "../validators/comercio.validator.js";

const UPDATABLE_FIELDS = ["nombre", "direccion", "zona", "tipo"] as const;
const TEXT_FIELDS = new Set(["nombre", "direccion", "zona"]);
const FILTER_FIELDS = ["zona", "tipo", "estado"] as const;

function trimIfText(field: string, value: unknown): unknown {
  return TEXT_FIELDS.has(field) && typeof value === "string" ? value.trim() : value;
}

// Only whitelisted fields, so estado and anything unknown can never be set through a general update.
function pickUpdates(body: Record<string, unknown>): ComercioChanges {
  const updates: Record<string, unknown> = {};

  for (const field of UPDATABLE_FIELDS) {
    const value = body[field];
    if (value !== undefined) updates[field] = trimIfText(field, value);
  }

  return updates as ComercioChanges;
}

export function createComercioController(comercios: ComercioRepository) {
  async function applyUpdate(req: Request, res: Response, changes: ComercioChanges): Promise<void> {
    const id = req.params["id"];

    if (!isUuid(id)) {
      res.status(400).json({ message: "Invalid comercio id" });
      return;
    }

    const comercio = await comercios.update(id, changes);
    if (!comercio) {
      res.status(404).json({ message: "Comercio not found" });
      return;
    }

    res.json(comercio);
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const { nombre, direccion, zona, tipo } = req.body;

      const comercio = await comercios.create({
        nombre: String(nombre).trim(),
        direccion: String(direccion).trim(),
        zona: String(zona).trim(),
        tipo,
        estado: "ACTIVO",
      });

      res.status(201).json(comercio);
    },

    async list(req: Request, res: Response): Promise<void> {
      const validation = validateComercioFilters(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const filter: Record<string, string> = {};
      for (const field of FILTER_FIELDS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value.trim();
      }

      res.json(await comercios.list(filter as ComercioFilter));
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid comercio id" });
        return;
      }

      const comercio = await comercios.findById(id);
      if (!comercio) {
        res.status(404).json({ message: "Comercio not found" });
        return;
      }

      res.json(comercio);
    },

    async update(req: Request, res: Response): Promise<void> {
      await applyUpdate(req, res, pickUpdates(req.body));
    },

    async setEstado(req: Request, res: Response): Promise<void> {
      await applyUpdate(req, res, { estado: req.body.estado });
    },
  };
}
