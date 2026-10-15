import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAuditoriaController } from "../controllers/auditoria.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { getDb } from "../db/index.js";
import { createAuditoriaRepository } from "../repositories/auditoria.repository.js";

const controller = createAuditoriaController(createAuditoriaRepository(getDb()));
const authenticate = createAuthenticate(getAuthConfig().secret);

const auditoriaRouter = Router();

auditoriaRouter.use(authenticate);

// Surveyors cannot read the audit trail, not even of their own prices.
auditoriaRouter.get(
  "/precios",
  authorize("SUPERVISOR", "ANALISTA", "COORDINADOR", "DIRECCION"),
  controller.listPrecios,
);

export default auditoriaRouter;
