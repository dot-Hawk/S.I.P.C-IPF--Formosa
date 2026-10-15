import { type Request, type Response } from "express";
import { type AuthPayload } from "../auth/token.service.js";
import { type Precio, type Relevamiento } from "../db/schema.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type AsignacionRepository } from "../repositories/asignacion.repository.js";
import { type PrecioRepository } from "../repositories/precio.repository.js";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { isUuid } from "../utils/uuid.js";

export interface PrecioAccessRepositories {
  precios: PrecioRepository;
  relevamientos: RelevamientoRepository;
  asignaciones: AsignacionRepository;
}

export function getAuth(res: Response): AuthPayload | undefined {
  return res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;
}

// Who may see or change a precio, shared by everything that hangs from it (its attachments).
// Every guard answers the request itself and returns null when access is not granted.
export function createPrecioAccess(repos: PrecioAccessRepositories) {
  function isVisibleTo(precio: Precio, auth: AuthPayload): boolean {
    return auth.role !== "ENCUESTADOR" || precio.encuestador === auth.userId;
  }

  // Reading: any authenticated role, except that a surveyor only sees their own prices.
  async function loadVisible(
    req: Request,
    res: Response,
    param = "id",
  ): Promise<{ precio: Precio; auth: AuthPayload } | null> {
    const auth = getAuth(res);
    if (!auth) {
      res.status(401).json({ message: "Authentication required" });
      return null;
    }

    const id = req.params[param];
    if (!isUuid(id)) {
      res.status(400).json({ message: "Invalid precio id" });
      return null;
    }

    const precio = await repos.precios.findById(id);
    if (!precio || !isVisibleTo(precio, auth)) {
      res.status(404).json({ message: "Precio not found" });
      return null;
    }

    return { precio, auth };
  }

  // Editing or deleting. The owner may act while the relevamiento is open and the asignacion is
  // still EN_CURSO. With `allowSupervisor`, a SUPERVISOR may act on any precio (also after the
  // asignacion is COMPLETADA) but still only while the relevamiento is open, since closing
  // freezes the data.
  async function loadEditable(
    req: Request,
    res: Response,
    { allowSupervisor = false, param = "id" } = {},
  ): Promise<{ precio: Precio; auth: AuthPayload; relevamiento: Relevamiento } | null> {
    const auth = getAuth(res);
    if (!auth) {
      res.status(401).json({ message: "Authentication required" });
      return null;
    }

    const id = req.params[param];
    if (!isUuid(id)) {
      res.status(400).json({ message: "Invalid precio id" });
      return null;
    }

    const asSupervisor = allowSupervisor && auth.role === "SUPERVISOR";

    const precio = await repos.precios.findById(id);
    if (!precio || (!asSupervisor && precio.encuestador !== auth.userId)) {
      res.status(404).json({ message: "Precio not found" });
      return null;
    }

    const relevamiento = await repos.relevamientos.findById(precio.relevamiento);
    if (!relevamiento || relevamiento.estado !== "ABIERTO") {
      res.status(409).json({ message: "Relevamiento is not ABIERTO" });
      return null;
    }

    if (asSupervisor) return { precio, auth, relevamiento };

    if (!(await repos.asignaciones.hasEnCurso(precio.relevamiento, precio.comercio, auth.userId))) {
      res.status(409).json({ message: "The asignacion is no longer EN_CURSO" });
      return null;
    }

    return { precio, auth, relevamiento };
  }

  return { isVisibleTo, loadVisible, loadEditable };
}
