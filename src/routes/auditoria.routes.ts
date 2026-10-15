import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAuditoriaController } from "../controllers/auditoria.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { PrecioAuditoria } from "../models/precio-auditoria.model.js";

const controller = createAuditoriaController(PrecioAuditoria);
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
