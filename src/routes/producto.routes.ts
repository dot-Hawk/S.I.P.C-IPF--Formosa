import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createProductoController } from "../controllers/producto.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { getDb } from "../db/index.js";
import { createUserRepository } from "../repositories/user.repository.js";
import { createCanastaRepository } from "../repositories/canasta.repository.js";
import { createProductoRepository } from "../repositories/producto.repository.js";
import {
  validateProductoCreate,
  validateProductoEstado,
  validateProductoUpdate,
} from "../validators/producto.validator.js";

const controller = createProductoController(createProductoRepository(getDb()), createCanastaRepository(getDb()));
const authenticate = createAuthenticate(getAuthConfig().secret, createUserRepository(getDb()));

const productoRouter = Router();

productoRouter.use(authenticate);

productoRouter.post("/", authorize("COORDINADOR"), validateBody(validateProductoCreate), controller.create);
productoRouter.get("/", controller.list);
productoRouter.get("/:id", controller.getById);
productoRouter.patch("/:id", authorize("COORDINADOR"), validateBody(validateProductoUpdate), controller.update);
productoRouter.patch(
  "/:id/estado",
  authorize("COORDINADOR"),
  validateBody(validateProductoEstado),
  controller.setEstado,
);

export default productoRouter;
