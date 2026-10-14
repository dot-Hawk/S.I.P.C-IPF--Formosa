import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAsignacionController } from "../controllers/asignacion.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { getDb } from "../db/index.js";
import { createAsignacionRepository } from "../repositories/asignacion.repository.js";
import { createComercioRepository } from "../repositories/comercio.repository.js";
import { createRelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { createUserRepository } from "../repositories/user.repository.js";
import {
  validateAsignacionCreate,
  validateAsignacionEstado,
  validateAsignacionReassign,
} from "../validators/asignacion.validator.js";

const db = getDb();
const controller = createAsignacionController({
  asignaciones: createAsignacionRepository(db),
  relevamientos: createRelevamientoRepository(db),
  users: createUserRepository(db),
  comercios: createComercioRepository(db),
});
const authenticate = createAuthenticate(getAuthConfig().secret);

const asignacionRouter = Router();

asignacionRouter.use(authenticate);

asignacionRouter.post("/", authorize("COORDINADOR"), validateBody(validateAsignacionCreate), controller.create);
asignacionRouter.get("/", controller.list);
asignacionRouter.get("/:id", controller.getById);
asignacionRouter.patch(
  "/:id/estado",
  authorize("COORDINADOR", "ENCUESTADOR"),
  validateBody(validateAsignacionEstado),
  controller.setEstado,
);
asignacionRouter.patch(
  "/:id/encuestador",
  authorize("COORDINADOR"),
  validateBody(validateAsignacionReassign),
  controller.reassign,
);

export default asignacionRouter;
