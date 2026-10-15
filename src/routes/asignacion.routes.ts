import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAsignacionController } from "../controllers/asignacion.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { Asignacion } from "../models/asignacion.model.js";
import { Comercio } from "../models/comercio.model.js";
import { Relevamiento } from "../models/relevamiento.model.js";
import { User } from "../models/user.model.js";
import {
  validateAsignacionCreate,
  validateAsignacionEstado,
  validateAsignacionReassign,
} from "../validators/asignacion.validator.js";

const controller = createAsignacionController({
  asignacion: Asignacion,
  relevamiento: Relevamiento,
  user: User,
  comercio: Comercio,
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
