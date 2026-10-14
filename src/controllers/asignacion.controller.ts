import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type AuthPayload } from "../auth/token.service.js";
import { canTransition } from "../domain/asignacion.rules.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type IAsignacion } from "../models/interfaces/IAsignacion.interface.js";
import { type IComercio } from "../models/interfaces/IComercio.interface.js";
import { type IRelevamiento } from "../models/interfaces/IRelevamiento.interface.js";
import { type IUser } from "../models/interfaces/IUser.interface.js";
import { isDuplicateKeyError } from "../utils/mongo-errors.js";
import { isObjectIdString } from "../utils/object-id.js";
import { validateAsignacionFilters } from "../validators/asignacion.validator.js";

export interface AsignacionModels {
  asignacion: Model<IAsignacion>;
  relevamiento: Model<IRelevamiento>;
  user: Model<IUser>;
  comercio: Model<IComercio>;
}

const FILTER_FIELDS = ["relevamiento", "encuestador", "comercio", "estado"] as const;

function getAuth(res: Response): AuthPayload | undefined {
  return res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;
}

export function createAsignacionController(models: AsignacionModels) {
  // An ENCUESTADOR only ever sees their own asignaciones; others are reported as not found.
  function isVisibleTo(asignacion: IAsignacion, auth: AuthPayload): boolean {
    return auth.role !== "ENCUESTADOR" || String(asignacion.encuestador) === auth.userId;
  }

  async function findAssignableEncuestadorProblem(encuestadorId: string): Promise<string | null> {
    const encuestador = await models.user.findById(encuestadorId);

    if (!encuestador) return "Encuestador not found";
    if (encuestador.role !== "ENCUESTADOR" || encuestador.estado !== "ACTIVO") {
      return "encuestador must be an ACTIVO user with role ENCUESTADOR";
    }
    return null;
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const { relevamiento: relevamientoId, encuestador, comercio: comercioId } = req.body;

      const relevamiento = await models.relevamiento.findById(relevamientoId);
      if (!relevamiento) {
        res.status(404).json({ message: "Relevamiento not found" });
        return;
      }
      if (relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO" });
        return;
      }

      const encuestadorProblem = await findAssignableEncuestadorProblem(encuestador);
      if (encuestadorProblem) {
        const status = encuestadorProblem === "Encuestador not found" ? 404 : 400;
        res.status(status).json({ message: encuestadorProblem });
        return;
      }

      const comercio = await models.comercio.findById(comercioId);
      if (!comercio) {
        res.status(404).json({ message: "Comercio not found" });
        return;
      }
      if (comercio.estado !== "ACTIVO") {
        res.status(400).json({ message: "comercio must be ACTIVO" });
        return;
      }

      try {
        const asignacion = await models.asignacion.create({
          relevamiento: relevamientoId,
          encuestador,
          comercio: comercioId,
          estado: "PENDIENTE",
        });
        res.status(201).json(asignacion);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          res.status(409).json({ message: "This comercio is already assigned in this relevamiento" });
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

      const validation = validateAsignacionFilters(req.query);
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

      const asignaciones = await models.asignacion.find(filter).sort({ createdAt: -1 });
      res.json(asignaciones);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const id = req.params["id"];
      if (!isObjectIdString(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const asignacion = await models.asignacion.findById(id);
      if (!asignacion || !isVisibleTo(asignacion, auth)) {
        res.status(404).json({ message: "Asignacion not found" });
        return;
      }

      res.json(asignacion);
    },

    async setEstado(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const id = req.params["id"];
      if (!isObjectIdString(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const asignacion = await models.asignacion.findById(id);
      if (!asignacion || !isVisibleTo(asignacion, auth)) {
        res.status(404).json({ message: "Asignacion not found" });
        return;
      }

      const target = req.body.estado;
      if (!canTransition(asignacion.estado, target)) {
        res.status(409).json({ message: `Cannot change estado from ${asignacion.estado} to ${target}` });
        return;
      }

      const relevamiento = await models.relevamiento.findById(asignacion.relevamiento);
      if (!relevamiento || relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO" });
        return;
      }

      // Conditional on the estado we just read, so a concurrent change cannot be overwritten.
      const updated = await models.asignacion.findOneAndUpdate(
        { _id: id, estado: asignacion.estado },
        { estado: target },
        { new: true },
      );

      if (!updated) {
        res.status(409).json({ message: "Asignacion was modified concurrently, try again" });
        return;
      }

      res.json(updated);
    },

    async reassign(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isObjectIdString(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const encuestadorProblem = await findAssignableEncuestadorProblem(req.body.encuestador);
      if (encuestadorProblem) {
        const status = encuestadorProblem === "Encuestador not found" ? 404 : 400;
        res.status(status).json({ message: encuestadorProblem });
        return;
      }

      // Only a PENDIENTE asignacion can change hands, enforced atomically.
      const updated = await models.asignacion.findOneAndUpdate(
        { _id: id, estado: "PENDIENTE" },
        { encuestador: req.body.encuestador },
        { new: true },
      );

      if (updated) {
        res.json(updated);
        return;
      }

      if (await models.asignacion.exists({ _id: id })) {
        res.status(409).json({ message: "Only a PENDIENTE asignacion can be reassigned" });
        return;
      }

      res.status(404).json({ message: "Asignacion not found" });
    },
  };
}
