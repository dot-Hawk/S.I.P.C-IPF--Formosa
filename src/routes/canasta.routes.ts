import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createCanastaController } from "../controllers/canasta.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { getDb } from "../db/index.js";
import { createCanastaRepository } from "../repositories/canasta.repository.js";
import { validateCanastaEstado, validateVariedadCreate } from "../validators/canasta.validator.js";
import { createUserRepository } from "../repositories/user.repository.js";

const controller = createCanastaController(createCanastaRepository(getDb()));
const authenticate = createAuthenticate(getAuthConfig().secret, createUserRepository(getDb()));

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
