import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createRelevamientoController } from "../controllers/relevamiento.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateRelevamiento } from "../middlewares/validate-relevamiento.middleware.js";
import { Relevamiento } from "../models/relevamiento.model.js";

const controller = createRelevamientoController(Relevamiento);
const authenticate = createAuthenticate(getAuthConfig().secret);

const relevamientoRouter = Router();

relevamientoRouter.use(authenticate);

relevamientoRouter.post("/", authorize("COORDINADOR"), validateRelevamiento, controller.create);
relevamientoRouter.get("/", controller.list);
relevamientoRouter.get("/:id", controller.getById);

export default relevamientoRouter;
