import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createPrecioController } from "../controllers/precio.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { Asignacion } from "../models/asignacion.model.js";
import { Precio } from "../models/precio.model.js";
import { Producto } from "../models/producto.model.js";
import { Relevamiento } from "../models/relevamiento.model.js";
import { validatePrecioCreate, validatePrecioUpdate } from "../validators/precio.validator.js";

const controller = createPrecioController({
  precio: Precio,
  relevamiento: Relevamiento,
  asignacion: Asignacion,
  producto: Producto,
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
precioRouter.patch("/:id", authorize("ENCUESTADOR"), validateBody(validatePrecioUpdate), controller.update);
precioRouter.delete("/:id", authorize("ENCUESTADOR"), controller.remove);

export default precioRouter;
