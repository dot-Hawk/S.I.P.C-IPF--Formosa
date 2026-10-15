import express, { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { getUploadsDir } from "../config/storage.js";
import { MAX_ADJUNTO_BYTES } from "../domain/adjunto.js";
import { createAdjuntoController } from "../controllers/adjunto.controller.js";
import { createPrecioController } from "../controllers/precio.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { getDb } from "../db/index.js";
import { createAdjuntoRepository } from "../repositories/adjunto.repository.js";
import { createAsignacionRepository } from "../repositories/asignacion.repository.js";
import { createPrecioRepository } from "../repositories/precio.repository.js";
import { createProductoRepository } from "../repositories/producto.repository.js";
import { createRelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { createLocalDiskStorage } from "../storage/attachment-storage.js";
import { validatePrecioCreate, validatePrecioUpdate } from "../validators/precio.validator.js";

const db = getDb();
const precios = createPrecioRepository(db);
const relevamientos = createRelevamientoRepository(db);
const asignaciones = createAsignacionRepository(db);
const adjuntos = createAdjuntoRepository(db);
const storage = createLocalDiskStorage(getUploadsDir());

const controller = createPrecioController({
  precios,
  relevamientos,
  asignaciones,
  productos: createProductoRepository(db),
  adjuntos,
  storage,
});
const adjuntoController = createAdjuntoController({ precios, relevamientos, asignaciones, adjuntos, storage });

// The file is the raw body, whatever its Content-Type: the real type is decided from the bytes.
// Past the limit the parser answers 413 before the file is buffered.
const rawFile = express.raw({ type: () => true, limit: MAX_ADJUNTO_BYTES });
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

precioRouter.post("/:id/adjuntos", authorize("ENCUESTADOR"), rawFile, adjuntoController.create);
precioRouter.get("/:id/adjuntos", adjuntoController.list);
precioRouter.get("/:id/adjuntos/:adjuntoId", adjuntoController.download);
precioRouter.delete("/:id/adjuntos/:adjuntoId", authorize("ENCUESTADOR"), adjuntoController.remove);

export default precioRouter;
