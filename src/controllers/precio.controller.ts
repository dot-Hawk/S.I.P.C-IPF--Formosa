import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type AuthPayload } from "../auth/token.service.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type IAsignacion } from "../models/interfaces/IAsignacion.interface.js";
import { type IPrecio } from "../models/interfaces/IPrecio.interface.js";
import {
  type AccionAuditoria,
  type IPrecioAuditoria,
  type PrecioSnapshot,
} from "../models/interfaces/IPrecioAuditoria.interface.js";
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
  auditoria: Model<IPrecioAuditoria>;
}

const FILTER_FIELDS = ["relevamiento", "comercio", "producto", "encuestador"] as const;

function snapshot(precio: IPrecio): PrecioSnapshot {
  return {
    valor: precio.valor,
    oferta: precio.oferta ?? false,
    observacion: precio.observacion ?? null,
    fechaRelevamiento: precio.fechaRelevamiento,
  };
}

function getAuth(res: Response): AuthPayload | undefined {
  return res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;
}

export function createPrecioController(models: PrecioModels) {
  // The audit trail must never turn a successful change into an error response: if it cannot be
  // written, the entry is logged so it can be recovered.
  async function audit(
    accion: AccionAuditoria,
    auth: AuthPayload,
    precio: IPrecio,
    anterior: PrecioSnapshot | null,
    posterior: PrecioSnapshot | null,
  ): Promise<void> {
    const entry = {
      precio: precio._id,
      relevamiento: precio.relevamiento,
      comercio: precio.comercio,
      producto: precio.producto,
      accion,
      usuario: auth.userId,
      rol: auth.role,
      anterior,
      posterior,
    };

    try {
      await models.auditoria.create(entry);
    } catch (error) {
      console.error("Failed to record precio audit entry", entry, error);
    }
  }

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

  // Shared guard for editing or deleting. The owner may act while the relevamiento is open
  // and the asignacion is still EN_CURSO. With `allowSupervisor`, a SUPERVISOR may act on any
  // precio (also after the asignacion is COMPLETADA) but still only while the relevamiento is
  // open, since closing freezes the data. Responds and returns null when not allowed.
  async function loadEditable(
    req: Request,
    res: Response,
    { allowSupervisor = false } = {},
  ): Promise<IPrecio | null> {
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

    const asSupervisor = allowSupervisor && auth.role === "SUPERVISOR";

    const precio = await models.precio.findById(id);
    if (!precio || (!asSupervisor && String(precio.encuestador) !== auth.userId)) {
      res.status(404).json({ message: "Precio not found" });
      return null;
    }

    const relevamiento = await models.relevamiento.findById(precio.relevamiento);
    if (!relevamiento || relevamiento.estado !== "ABIERTO") {
      res.status(409).json({ message: "Relevamiento is not ABIERTO" });
      return null;
    }

    if (asSupervisor) return precio;

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

      const { relevamiento: relevamientoId, comercio, producto: productoId, valor, observacion, oferta } = req.body;

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
        oferta: oferta ?? false,
        fechaRelevamiento,
      };
      if (observacion !== undefined) data["observacion"] = observacion.trim();

      try {
        const precio = await models.precio.create(data);
        await audit("CREACION", auth, precio, null, snapshot(precio));
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

      const filter: Record<string, string | boolean> = {};
      for (const field of FILTER_FIELDS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value;
      }
      if (auth.role === "ENCUESTADOR") filter["encuestador"] = auth.userId;
      if (req.query["oferta"] !== undefined) filter["oferta"] = req.query["oferta"] === "true";

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
      const precio = await loadEditable(req, res, { allowSupervisor: true });
      const auth = getAuth(res);
      if (!precio || !auth) return;

      const updates: Record<string, unknown> = {};
      if (req.body.valor !== undefined) updates["valor"] = req.body.valor;
      if (req.body.observacion !== undefined) updates["observacion"] = req.body.observacion.trim();
      if (req.body.oferta !== undefined) updates["oferta"] = req.body.oferta;

      try {
        const updated = await models.precio.findOneAndUpdate(
          { _id: precio._id },
          { $set: updates },
          { new: true, runValidators: true },
        );
        if (!updated) {
          res.status(404).json({ message: "Precio not found" });
          return;
        }

        await audit("MODIFICACION", auth, precio, snapshot(precio), snapshot(updated));
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
      const auth = getAuth(res);
      if (!precio || !auth) return;

      await models.precio.deleteOne({ _id: precio._id });
      await audit("ELIMINACION", auth, precio, snapshot(precio), null);
      res.status(204).end();
    },
  };
}
