import { type Request, type Response } from "express";
import { isValidObjectId, type Model } from "mongoose";
import { type IComercio } from "../models/interfaces/IComercio.interface.js";
import { isMongooseValidationError } from "../utils/mongo-errors.js";
import { validateComercioFilters } from "../validators/comercio.validator.js";

const UPDATABLE_FIELDS = ["nombre", "direccion", "zona", "tipo"] as const;
const TEXT_FIELDS = new Set(["nombre", "direccion", "zona"]);
const FILTER_FIELDS = ["zona", "tipo", "estado"] as const;

function pickUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const field of UPDATABLE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    updates[field] = TEXT_FIELDS.has(field) && typeof value === "string" ? value.trim() : value;
  }

  return updates;
}

export function createComercioController(model: Model<IComercio>) {
  async function applyUpdate(
    req: Request,
    res: Response,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const id = req.params["id"];

    if (!id || !isValidObjectId(id)) {
      res.status(400).json({ message: "Invalid comercio id" });
      return;
    }

    try {
      const comercio = await model.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true },
      );

      if (!comercio) {
        res.status(404).json({ message: "Comercio not found" });
        return;
      }

      res.json(comercio);
    } catch (error) {
      if (isMongooseValidationError(error)) {
        res.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const { nombre, direccion, zona, tipo } = req.body;

      try {
        const comercio = await model.create({
          nombre: String(nombre).trim(),
          direccion: String(direccion).trim(),
          zona: String(zona).trim(),
          tipo,
          estado: "ACTIVO",
        });
        res.status(201).json(comercio);
      } catch (error) {
        if (isMongooseValidationError(error)) {
          res.status(400).json({ message: error.message });
          return;
        }
        throw error;
      }
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

      const comercios = await model.find(filter).sort({ nombre: 1 });
      res.json(comercios);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!id || !isValidObjectId(id)) {
        res.status(400).json({ message: "Invalid comercio id" });
        return;
      }

      const comercio = await model.findById(id);
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
