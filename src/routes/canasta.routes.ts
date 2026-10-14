import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createCanastaController } from "../controllers/canasta.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { CanastaNodo } from "../models/canasta-nodo.model.js";
import { validateCanastaEstado, validateVariedadCreate } from "../validators/canasta.validator.js";

const controller = createCanastaController(CanastaNodo);
const authenticate = createAuthenticate(getAuthConfig().secret);

const canastaRouter = Router();

canastaRouter.use(authenticate);

canastaRouter.get("/", controller.list);
canastaRouter.get("/:codigo", controller.getByCodigo);
canastaRouter.post("/", authorize("COORDINADOR"), validateBody(validateVariedadCreate), controller.createVariedad);
canastaRouter.patch(
  "/:codigo/estado",
  authorize("COORDINADOR"),
  validateBody(validateCanastaEstado),
  controller.setEstado,
);

export default canastaRouter;
