import { type Request, type Response } from "express";
import { type CanastaRepository } from "../repositories/canasta.repository.js";
import {
  type ProductoChanges,
  type ProductoFilter,
  type ProductoInput,
  type ProductoRepository,
} from "../repositories/producto.repository.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isUuid } from "../utils/uuid.js";
import { validateProductoFilters } from "../validators/producto.validator.js";

const UPDATABLE_FIELDS = [
  "nombre",
  "categoria",
  "unidad",
  "cantidadReferencia",
  "marca",
  "codigoVariedad",
] as const;
const TEXT_FIELDS = new Set(["nombre", "categoria", "marca", "codigoVariedad"]);
const FILTER_FIELDS = ["categoria", "unidad", "estado", "codigoVariedad"] as const;
const INVALID_VARIEDAD_MESSAGE = "codigoVariedad must be an existing active variedad of the canasta";
const DUPLICATE_MESSAGE =
  "A producto with the same nombre, marca, unidad and cantidadReferencia already exists";

function trimIfText(field: string, value: unknown): unknown {
  return TEXT_FIELDS.has(field) && typeof value === "string" ? value.trim() : value;
}

// Only whitelisted fields, so estado and anything unknown can never be set through a general update.
function pickUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const field of UPDATABLE_FIELDS) {
    const value = body[field];
    if (value !== undefined) updates[field] = trimIfText(field, value);
  }

  return updates;
}

export function createProductoController(productos: ProductoRepository, canasta: CanastaRepository) {
  async function isActiveVariedad(codigo: unknown): Promise<boolean> {
    return typeof codigo === "string" && (await canasta.isActiveVariedad(codigo));
  }

  async function applyUpdate(req: Request, res: Response, updates: Record<string, unknown>): Promise<void> {
    const id = req.params["id"];

    if (!isUuid(id)) {
      res.status(400).json({ message: "Invalid producto id" });
      return;
    }

    if (updates["codigoVariedad"] !== undefined && !(await isActiveVariedad(updates["codigoVariedad"]))) {
      res.status(400).json({ message: INVALID_VARIEDAD_MESSAGE });
      return;
    }

    try {
      const producto = await productos.update(id, updates as ProductoChanges);
      if (!producto) {
        res.status(404).json({ message: "Producto not found" });
        return;
      }

      res.json(producto);
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ message: DUPLICATE_MESSAGE });
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

      if (!(await isActiveVariedad(data["codigoVariedad"]))) {
        res.status(400).json({ message: INVALID_VARIEDAD_MESSAGE });
        return;
      }

      try {
        const producto = await productos.create(data as ProductoInput);
        res.status(201).json(producto);
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ message: DUPLICATE_MESSAGE });
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

      res.json(await productos.list(filter as ProductoFilter));
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid producto id" });
        return;
      }

      const producto = await productos.findById(id);
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
