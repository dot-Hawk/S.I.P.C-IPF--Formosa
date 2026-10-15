import { type Request, type Response } from "express";
import { type AuthPayload } from "../auth/token.service.js";
import { canCancel, canTransition } from "../domain/asignacion.rules.js";
import { ERROR_CODES } from "../domain/error-codes.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type Asignacion } from "../db/schema.js";
import {
  type AsignacionFilter,
  type AsignacionRepository,
} from "../repositories/asignacion.repository.js";
import { type ComercioRepository } from "../repositories/comercio.repository.js";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { type UserRepository } from "../repositories/user.repository.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isUuid } from "../utils/uuid.js";
import { validateAsignacionFilters } from "../validators/asignacion.validator.js";
import { parsePage, validatePagination } from "../validators/pagination.js";

export interface AsignacionRepositories {
  asignaciones: AsignacionRepository;
  relevamientos: RelevamientoRepository;
  users: UserRepository;
  comercios: ComercioRepository;
}

const FILTER_FIELDS = ["relevamiento", "encuestador", "comercio", "estado"] as const;

function getAuth(res: Response): AuthPayload | undefined {
  return res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;
}

export function createAsignacionController(repos: AsignacionRepositories) {
  // An ENCUESTADOR only ever sees their own, non-cancelled asignaciones; others are reported as not found.
  function isVisibleTo(asignacion: Asignacion, auth: AuthPayload): boolean {
    return (
      auth.role !== "ENCUESTADOR" || (asignacion.encuestador === auth.userId && asignacion.estado !== "CANCELADA")
    );
  }

  async function findAssignableEncuestadorProblem(encuestadorId: string): Promise<string | null> {
    const encuestador = await repos.users.findById(encuestadorId);

    if (!encuestador) return "Encuestador not found";
    if (encuestador.role !== "ENCUESTADOR" || encuestador.estado !== "ACTIVO") {
      return "encuestador must be an ACTIVO user with role ENCUESTADOR";
    }
    return null;
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const { relevamiento: relevamientoId, encuestador, comercio: comercioId } = req.body;

      const relevamiento = await repos.relevamientos.findById(relevamientoId);
      if (!relevamiento) {
        res.status(404).json({ message: "Relevamiento not found" });
        return;
      }
      if (relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO", code: ERROR_CODES.RELEVAMIENTO_NOT_ABIERTO });
        return;
      }

      const encuestadorProblem = await findAssignableEncuestadorProblem(encuestador);
      if (encuestadorProblem) {
        const status = encuestadorProblem === "Encuestador not found" ? 404 : 400;
        res.status(status).json({ message: encuestadorProblem });
        return;
      }

      const comercio = await repos.comercios.findById(comercioId);
      if (!comercio) {
        res.status(404).json({ message: "Comercio not found" });
        return;
      }
      if (comercio.estado !== "ACTIVO") {
        res.status(400).json({ message: "comercio must be ACTIVO" });
        return;
      }

      try {
        const asignacion = await repos.asignaciones.create({
          relevamiento: relevamientoId,
          encuestador,
          comercio: comercioId,
          estado: "PENDIENTE",
        });
        res.status(201).json(asignacion);
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({
            message: "This comercio is already assigned in this relevamiento",
            code: ERROR_CODES.COMERCIO_ALREADY_ASSIGNED,
          });
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
      const pagination = validatePagination(req.query);
      if (!validation.valid || pagination.length > 0) {
        res.status(400).json({ errors: [...validation.errors, ...pagination] });
        return;
      }

      const filter: Record<string, string> = {};
      for (const field of FILTER_FIELDS) {
        const value = req.query[field];
        if (typeof value === "string") filter[field] = value;
      }
      if (auth.role === "ENCUESTADOR") {
        filter["encuestador"] = auth.userId;
        filter["excludeEstado"] = "CANCELADA";
      }

      // Every row unless page or limit is given; X-Total-Count is always the filtered total.
      const paged = req.query["page"] !== undefined || req.query["limit"] !== undefined;
      const [found, total] = await Promise.all([
        repos.asignaciones.list(filter as AsignacionFilter, paged ? parsePage(req.query) : undefined),
        repos.asignaciones.count(filter as AsignacionFilter),
      ]);
      res.setHeader("X-Total-Count", String(total));
      res.json(found);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const asignacion = await repos.asignaciones.findById(id);
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
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const asignacion = await repos.asignaciones.findById(id);
      if (!asignacion || !isVisibleTo(asignacion, auth)) {
        res.status(404).json({ message: "Asignacion not found" });
        return;
      }

      const target = req.body.estado;
      if (!canTransition(asignacion.estado, target)) {
        res.status(409).json({
          message: `Cannot change estado from ${asignacion.estado} to ${target}`,
          code: ERROR_CODES.INVALID_ESTADO_TRANSITION,
        });
        return;
      }

      const relevamiento = await repos.relevamientos.findById(asignacion.relevamiento);
      if (!relevamiento || relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO", code: ERROR_CODES.RELEVAMIENTO_NOT_ABIERTO });
        return;
      }

      // Conditional on the estado we just read, so a concurrent change cannot be overwritten.
      const updated = await repos.asignaciones.transitionEstado(id, asignacion.estado, target);
      if (!updated) {
        res.status(409).json({
          message: "Asignacion was modified concurrently, try again",
          code: ERROR_CODES.ASIGNACION_CONCURRENT_MODIFICATION,
        });
        return;
      }

      res.json(updated);
    },

    // Soft cancel: the row stays as history and stops counting against the comercio's uniqueness.
    async cancel(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const asignacion = await repos.asignaciones.findById(id);
      if (!asignacion) {
        res.status(404).json({ message: "Asignacion not found" });
        return;
      }

      if (!canCancel(asignacion.estado)) {
        res.status(409).json({
          message: `A ${asignacion.estado} asignacion cannot be cancelled`,
          code: ERROR_CODES.ASIGNACION_NOT_CANCELABLE,
        });
        return;
      }

      const relevamiento = await repos.relevamientos.findById(asignacion.relevamiento);
      if (!relevamiento || relevamiento.estado !== "ABIERTO") {
        res.status(409).json({ message: "Relevamiento is not ABIERTO", code: ERROR_CODES.RELEVAMIENTO_NOT_ABIERTO });
        return;
      }

      // Conditional on the estado we just read, so a concurrent change cannot be overwritten.
      const updated = await repos.asignaciones.transitionEstado(id, asignacion.estado, "CANCELADA");
      if (!updated) {
        res.status(409).json({
          message: "Asignacion was modified concurrently, try again",
          code: ERROR_CODES.ASIGNACION_CONCURRENT_MODIFICATION,
        });
        return;
      }

      res.json(updated);
    },

    async reassign(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid asignacion id" });
        return;
      }

      const encuestadorProblem = await findAssignableEncuestadorProblem(req.body.encuestador);
      if (encuestadorProblem) {
        const status = encuestadorProblem === "Encuestador not found" ? 404 : 400;
        res.status(status).json({ message: encuestadorProblem });
        return;
      }

      const updated = await repos.asignaciones.reassignIfPendiente(id, req.body.encuestador);
      if (updated) {
        res.json(updated);
        return;
      }

      if (await repos.asignaciones.findById(id)) {
        res.status(409).json({
          message: "Only a PENDIENTE asignacion can be reassigned",
          code: ERROR_CODES.ASIGNACION_NOT_PENDIENTE,
        });
        return;
      }

      res.status(404).json({ message: "Asignacion not found" });
    },
  };
}
