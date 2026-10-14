import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createPrecioController } from "../controllers/precio.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { getDb } from "../db/index.js";
import { createAsignacionRepository } from "../repositories/asignacion.repository.js";
import { createPrecioRepository } from "../repositories/precio.repository.js";
import { createProductoRepository } from "../repositories/producto.repository.js";
import { createRelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { validatePrecioCreate, validatePrecioUpdate } from "../validators/precio.validator.js";

const db = getDb();
const controller = createPrecioController({
  precios: createPrecioRepository(db),
  relevamientos: createRelevamientoRepository(db),
  asignaciones: createAsignacionRepository(db),
  productos: createProductoRepository(db),
});
const authenticate = createAuthenticate(getAuthConfig().secret);

const precioRouter = Router();

precioRouter.use(authenticate);

precioRouter.post(
  "/",
  authorize("ENCUESTADOR"),
  validateBody((input) => validatePrecioCreate(input)),
  controller.create,
);
precioRouter.get("/", controller.list);
precioRouter.get("/:id", controller.getById);
precioRouter.patch("/:id", authorize("ENCUESTADOR", "SUPERVISOR"), validateBody(validatePrecioUpdate), controller.update);
precioRouter.delete("/:id", authorize("ENCUESTADOR"), controller.remove);

export default precioRouter;
