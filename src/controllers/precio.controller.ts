import { type Request, type Response } from "express";
import { type AuthPayload } from "../auth/token.service.js";
import { evaluarDesvio, type Alerta } from "../domain/desvio.js";
import { type AdjuntoRepository } from "../repositories/adjunto.repository.js";
import { type AsignacionRepository } from "../repositories/asignacion.repository.js";
import {
  type Actor,
  type PrecioChanges,
  type PrecioFilter,
  type PrecioInput,
  type PrecioRepository,
} from "../repositories/precio.repository.js";
import { type ProductoRepository } from "../repositories/producto.repository.js";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { createPrecioAccess, getAuth } from "./precio-access.js";
import { type AttachmentStorage } from "../storage/attachment-storage.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isUuid } from "../utils/uuid.js";
import { DEFAULT_PAGE_SIZE, validatePrecioFilters } from "../validators/precio.validator.js";

export interface PrecioRepositories {
  precios: PrecioRepository;
  relevamientos: RelevamientoRepository;
  asignaciones: AsignacionRepository;
  productos: ProductoRepository;
  // The stored files of a deleted precio go with it.
  adjuntos: AdjuntoRepository;
  storage: AttachmentStorage;
}

const FILTER_FIELDS = ["relevamiento", "comercio", "producto", "encuestador"] as const;

function toActor(auth: AuthPayload): Actor {
  return { userId: auth.userId, role: auth.role };
}

export function createPrecioController(repos: PrecioRepositories) {
  const { isVisibleTo, loadEditable } = createPrecioAccess(repos);

  // The warning asks the surveyor to double-check; it never blocks a price that is confirmed.
  function alertaRequerida(res: Response, alerta: Alerta): void {
    res.status(409).json({
      message: "El precio se aleja del historial de este producto en este comercio: verifíquelo y confírmelo",
      requiereConfirmacion: true,
      alerta,
    });
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const { relevamiento: relevamientoId, comercio, producto: productoId, valor, observacion, oferta } = req.body;

      const relevamiento = await repos.relevamientos.findById(relevamientoId);
      if (!relevamiento) {
        res.status(404).json({ message: "Relevamiento not found" });
        return;
      }
      if (relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO" });
        return;
      }

      if (!(await repos.asignaciones.hasEnCurso(relevamientoId, comercio, auth.userId))) {
        res.status(403).json({
          message: "You have no EN_CURSO asignacion for this comercio in this relevamiento",
        });
        return;
      }

      const producto = await repos.productos.findById(productoId);
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

      // Promotional prices are expected to be unusual, so they are not judged.
      let alerta: Alerta | null = null;
      if (oferta !== true) {
        const historial = await repos.precios.historial(productoId, comercio, relevamiento.fechaInicio);
        alerta = evaluarDesvio(historial, valor);
        if (alerta && req.body.confirmarDesvio !== true) {
          alertaRequerida(res, alerta);
          return;
        }
      }

      const data: Record<string, unknown> = {
        relevamiento: relevamientoId,
        producto: productoId,
        comercio,
        encuestador: auth.userId,
        valor,
        oferta: oferta ?? false,
        fechaRelevamiento,
        alerta,
      };
      if (observacion !== undefined) data["observacion"] = observacion.trim();

      try {
        const precio = await repos.precios.create(data as PrecioInput, toActor(auth));
        res.status(201).json(precio);
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ message: "A precio already exists for this producto, comercio and relevamiento" });
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
      if (req.query["conAlerta"] === "true") filter["conAlerta"] = true;

      const limit = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : DEFAULT_PAGE_SIZE;
      const page = typeof req.query["page"] === "string" ? Number(req.query["page"]) : 1;

      res.json(await repos.precios.list(filter as PrecioFilter, { limit, offset: (page - 1) * limit }));
    },

    async getById(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid precio id" });
        return;
      }

      const precio = await repos.precios.findById(id);
      if (!precio || !isVisibleTo(precio, auth)) {
        res.status(404).json({ message: "Precio not found" });
        return;
      }

      res.json(precio);
    },

    async update(req: Request, res: Response): Promise<void> {
      const loaded = await loadEditable(req, res, { allowReviewer: true });
      if (!loaded) return;

      const changes: PrecioChanges = {};
      if (req.body.valor !== undefined) changes.valor = req.body.valor;
      if (req.body.observacion !== undefined) changes.observacion = req.body.observacion.trim();
      if (req.body.oferta !== undefined) changes.oferta = req.body.oferta;

      // A new value (or turning a promotion off) is judged again against the history.
      if (changes.valor !== undefined || changes.oferta !== undefined) {
        const valor = changes.valor ?? loaded.precio.valor;
        const oferta = changes.oferta ?? loaded.precio.oferta;

        let alerta: Alerta | null = null;
        if (!oferta) {
          const historial = await repos.precios.historial(
            loaded.precio.producto,
            loaded.precio.comercio,
            loaded.relevamiento.fechaInicio,
          );
          alerta = evaluarDesvio(historial, valor);
          if (alerta && req.body.confirmarDesvio !== true) {
            alertaRequerida(res, alerta);
            return;
          }
        }
        changes.alerta = alerta;
      }

      const updated = await repos.precios.update(loaded.precio.id, changes, toActor(loaded.auth));
      if (!updated) {
        res.status(404).json({ message: "Precio not found" });
        return;
      }

      res.json(updated);
    },

    async remove(req: Request, res: Response): Promise<void> {
      const loaded = await loadEditable(req, res);
      if (!loaded) return;

      // The rows disappear with the precio (cascade), so the keys are read first.
      const adjuntos = await repos.adjuntos.listByPrecio(loaded.precio.id);

      const removed = await repos.precios.remove(loaded.precio.id, toActor(loaded.auth));
      if (!removed) {
        res.status(404).json({ message: "Precio not found" });
        return;
      }

      for (const { clave } of adjuntos) {
        try {
          await repos.storage.remove(clave);
        } catch (error) {
          console.error(`Could not remove stored file ${clave}`, error);
        }
      }

      res.status(204).end();
    },
  };
}
