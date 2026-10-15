import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type AuthPayload } from "../auth/token.service.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type IAsignacion } from "../models/interfaces/IAsignacion.interface.js";
import { type IPrecio } from "../models/interfaces/IPrecio.interface.js";
import { type IProducto } from "../models/interfaces/IProducto.interface.js";
import { type IRelevamiento } from "../models/interfaces/IRelevamiento.interface.js";
import { isDuplicateKeyError, isMongooseValidationError } from "../utils/mongo-errors.js";
import { isObjectIdString } from "../utils/object-id.js";
import {
  DEFAULT_PAGE_SIZE,
  validatePrecioFilters,
} from "../validators/precio.validator.js";

export interface PrecioModels {
  precio: Model<IPrecio>;
  relevamiento: Model<IRelevamiento>;
  asignacion: Model<IAsignacion>;
  producto: Model<IProducto>;
}

const FILTER_FIELDS = ["relevamiento", "comercio", "producto", "encuestador"] as const;

function getAuth(res: Response): AuthPayload | undefined {
  return res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;
}

export function createPrecioController(models: PrecioModels) {
  function isVisibleTo(precio: IPrecio, auth: AuthPayload): boolean {
    return auth.role !== "ENCUESTADOR" || String(precio.encuestador) === auth.userId;
  }

  async function hasEnCursoAsignacion(
    relevamiento: IAsignacion["relevamiento"],
    comercio: IAsignacion["comercio"],
    encuestador: string,
  ): Promise<boolean> {
    const found = await models.asignacion.exists({
      relevamiento,
      comercio,
      encuestador,
      estado: "EN_CURSO",
    });
    return found !== null;
  }

  // Shared guard for editing or deleting: the owner, while the relevamiento is open
  // and the asignacion is still EN_CURSO. Responds and returns null when not allowed.
  async function loadEditable(req: Request, res: Response): Promise<IPrecio | null> {
    const auth = getAuth(res);
    if (!auth) {
      res.status(401).json({ message: "Authentication required" });
      return null;
    }

    const id = req.params["id"];
    if (!isObjectIdString(id)) {
      res.status(400).json({ message: "Invalid precio id" });
      return null;
    }

    const precio = await models.precio.findById(id);
    if (!precio || String(precio.encuestador) !== auth.userId) {
      res.status(404).json({ message: "Precio not found" });
      return null;
    }

    const relevamiento = await models.relevamiento.findById(precio.relevamiento);
    if (!relevamiento || relevamiento.estado !== "ABIERTO") {
      res.status(409).json({ message: "Relevamiento is not ABIERTO" });
      return null;
    }

    if (!(await hasEnCursoAsignacion(precio.relevamiento, precio.comercio, auth.userId))) {
      res.status(409).json({ message: "The asignacion is no longer EN_CURSO" });
      return null;
    }

    return precio;
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const { relevamiento: relevamientoId, comercio, producto: productoId, valor, observacion } = req.body;

      const relevamiento = await models.relevamiento.findById(relevamientoId);
      if (!relevamiento) {
        res.status(404).json({ message: "Relevamiento not found" });
        return;
      }
      if (relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO" });
        return;
      }

      if (!(await hasEnCursoAsignacion(relevamientoId, comercio, auth.userId))) {
        res.status(403).json({
          message: "You have no EN_CURSO asignacion for this comercio in this relevamiento",
        });
        return;
      }

      const producto = await models.producto.findById(productoId);
      if (!producto) {
        res.status(404).json({ message: "Producto not found" });
        return;
      }
      if (producto.estado !== "ACTIVO") {
        res.status(400).json({ message: "producto must be ACTIVO" });
        return;
      }

      const fechaRelevamiento =
        req.body.fechaRelevamiento !== undefined ? new Date(req.body.fechaRelevamiento) : new Date();
      if (fechaRelevamiento < relevamiento.fechaInicio) {
        res.status(400).json({ message: "fechaRelevamiento cannot be before the relevamiento start" });
        return;
      }

      const data: Record<string, unknown> = {
        relevamiento: relevamientoId,
        producto: productoId,
        comercio,
        encuestador: auth.userId,
        valor,
        fechaRelevamiento,
      };
      if (observacion !== undefined) data["observacion"] = observacion.trim();

      try {
        const precio = await models.precio.create(data);
        res.status(201).json(precio);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          res.status(409).json({ message: "A precio already exists for this producto, comercio and relevamiento" });
          return;
        }
        if (isMongooseValidationError(error)) {
          res.status(400).json({ message: error.message });
          return;
        }
        throw error;
      }
    },

    async list(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const validation = validatePrecioFilters(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const filter: Record<string, string> = {};
      for (const field of FILTER_FIELDS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value;
      }
      if (auth.role === "ENCUESTADOR") filter["encuestador"] = auth.userId;

      const limit = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : DEFAULT_PAGE_SIZE;
      const page = typeof req.query["page"] === "string" ? Number(req.query["page"]) : 1;

      const precios = await models.precio
        .find(filter)
        .sort({ fechaRelevamiento: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json(precios);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const id = req.params["id"];
      if (!isObjectIdString(id)) {
        res.status(400).json({ message: "Invalid precio id" });
        return;
      }

      const precio = await models.precio.findById(id);
      if (!precio || !isVisibleTo(precio, auth)) {
        res.status(404).json({ message: "Precio not found" });
        return;
      }

      res.json(precio);
    },

    async update(req: Request, res: Response): Promise<void> {
      const precio = await loadEditable(req, res);
      if (!precio) return;

      const updates: Record<string, unknown> = {};
      if (req.body.valor !== undefined) updates["valor"] = req.body.valor;
      if (req.body.observacion !== undefined) updates["observacion"] = req.body.observacion.trim();

      try {
        const updated = await models.precio.findOneAndUpdate(
          { _id: precio._id },
          { $set: updates },
          { new: true, runValidators: true },
        );
        res.json(updated);
      } catch (error) {
        if (isMongooseValidationError(error)) {
          res.status(400).json({ message: error.message });
          return;
        }
        throw error;
      }
    },

    async remove(req: Request, res: Response): Promise<void> {
      const precio = await loadEditable(req, res);
      if (!precio) return;

      await models.precio.deleteOne({ _id: precio._id });
      res.status(204).end();
    },
  };
}
