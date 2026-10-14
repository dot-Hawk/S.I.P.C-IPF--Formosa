import { type Request, type Response } from "express";
import { isValidObjectId, type Model } from "mongoose";
import { type IProducto } from "../models/interfaces/IProducto.interface.js";
import { isMongooseValidationError } from "../utils/mongo-errors.js";
import { validateProductoFilters } from "../validators/producto.validator.js";

const UPDATABLE_FIELDS = ["nombre", "categoria", "unidad", "cantidadReferencia", "marca"] as const;
const TEXT_FIELDS = new Set(["nombre", "categoria", "marca"]);
const FILTER_FIELDS = ["categoria", "unidad", "estado"] as const;

function trimIfText(field: string, value: unknown): unknown {
  return TEXT_FIELDS.has(field) && typeof value === "string" ? value.trim() : value;
}

function pickUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const field of UPDATABLE_FIELDS) {
    const value = body[field];
    if (value !== undefined) updates[field] = trimIfText(field, value);
  }

  return updates;
}

export function createProductoController(model: Model<IProducto>) {
  async function applyUpdate(
    req: Request,
    res: Response,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const id = req.params["id"];

    if (!id || !isValidObjectId(id)) {
      res.status(400).json({ message: "Invalid producto id" });
      return;
    }

    try {
      const producto = await model.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true },
      );

      if (!producto) {
        res.status(404).json({ message: "Producto not found" });
        return;
      }

      res.json(producto);
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
      const data: Record<string, unknown> = {
        ...pickUpdates(req.body),
        estado: "ACTIVO",
      };

      try {
        const producto = await model.create(data);
        res.status(201).json(producto);
      } catch (error) {
        if (isMongooseValidationError(error)) {
          res.status(400).json({ message: error.message });
          return;
        }
        throw error;
      }
    },

    async list(req: Request, res: Response): Promise<void> {
      const validation = validateProductoFilters(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const filter: Record<string, string> = {};
      for (const field of FILTER_FIELDS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value.trim();
      }

      const productos = await model.find(filter).sort({ nombre: 1 });
      res.json(productos);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!id || !isValidObjectId(id)) {
        res.status(400).json({ message: "Invalid producto id" });
        return;
      }

      const producto = await model.findById(id);
      if (!producto) {
        res.status(404).json({ message: "Producto not found" });
        return;
      }

      res.json(producto);
    },

    async update(req: Request, res: Response): Promise<void> {
      await applyUpdate(req, res, pickUpdates(req.body));
    },

    async setEstado(req: Request, res: Response): Promise<void> {
      await applyUpdate(req, res, { estado: req.body.estado });
    },
  };
}
