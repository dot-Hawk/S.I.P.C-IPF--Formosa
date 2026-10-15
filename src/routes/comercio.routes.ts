import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createComercioController } from "../controllers/comercio.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { getDb } from "../db/index.js";
import { createComercioRepository } from "../repositories/comercio.repository.js";
import {
  validateComercioCreate,
  validateComercioEstado,
  validateComercioUpdate,
} from "../validators/comercio.validator.js";

const controller = createComercioController(createComercioRepository(getDb()));
const authenticate = createAuthenticate(getAuthConfig().secret);

const comercioRouter = Router();

comercioRouter.use(authenticate);

comercioRouter.post("/", authorize("COORDINADOR"), validateBody(validateComercioCreate), controller.create);
comercioRouter.get("/", controller.list);
comercioRouter.get("/:id", controller.getById);
comercioRouter.patch("/:id", authorize("COORDINADOR"), validateBody(validateComercioUpdate), controller.update);
comercioRouter.patch(
  "/:id/estado",
  authorize("COORDINADOR"),
  validateBody(validateComercioEstado),
  controller.setEstado,
);

export default comercioRouter;
