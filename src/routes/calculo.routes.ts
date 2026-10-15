import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { getEngineConfig } from "../config/engine.js";
import { createCalculoController } from "../controllers/calculo.controller.js";
import { getDb } from "../db/index.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { createCalculoRepository } from "../repositories/calculo.repository.js";
import { createCanastaRepository } from "../repositories/canasta.repository.js";
import { createCalculoService } from "../services/calculo.service.js";
import {
  createHttpEngineClient,
  EngineError,
  type EngineClient,
} from "../services/engine-client.js";
import { validateCalculoCreate } from "../validators/calculo.validator.js";

// The engine is configured lazily: the API boots (and everything else works) without it.
let httpClient: EngineClient | undefined;
const engine: EngineClient = {
  async calcular(request) {
    if (!httpClient) {
      try {
        const config = getEngineConfig();
        httpClient = createHttpEngineClient({
          baseUrl: config.url,
          apiKey: config.apiKey,
          timeoutMs: config.timeoutMs,
        });
      } catch {
        throw new EngineError("unavailable", "The calculation engine is not configured");
      }
    }
    return httpClient.calcular(request);
  },
};

const db = getDb();
const calculos = createCalculoRepository(db);
const service = createCalculoService({ calculos, canasta: createCanastaRepository(db), engine });
const controller = createCalculoController(service, calculos);
const authenticate = createAuthenticate(getAuthConfig().secret);

const calculoRouter = Router();

calculoRouter.use(authenticate);

const canRun = authorize("ANALISTA", "COORDINADOR");
const canRead = authorize("SUPERVISOR", "ANALISTA", "COORDINADOR", "DIRECCION");

calculoRouter.post("/", canRun, validateBody(validateCalculoCreate), controller.create);
calculoRouter.get("/", canRead, controller.list);
// Before "/:id", which would take "exportacion" for an id.
calculoRouter.get("/exportacion", canRun, controller.exportar);
calculoRouter.get("/:id", canRead, controller.getById);
calculoRouter.get("/:id/relativos", canRead, controller.relativos);
calculoRouter.get("/:id/imputaciones", canRead, controller.imputaciones);

export default calculoRouter;
