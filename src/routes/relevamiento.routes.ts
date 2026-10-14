import { Router } from "express";
import { createRelevamientoController } from "../controllers/relevamiento.controller.js";
import { validateRelevamiento } from "../middlewares/validate-relevamiento.middleware.js";
import { Relevamiento } from "../models/relevamiento.model.js";

const controller = createRelevamientoController(Relevamiento);

const relevamientoRouter = Router();

relevamientoRouter.post("/", validateRelevamiento, controller.create);
relevamientoRouter.get("/", controller.list);
relevamientoRouter.get("/:id", controller.getById);

export default relevamientoRouter;
