import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createUserController } from "../controllers/user.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { validateUser } from "../middlewares/validate-user.middleware.js";
import { validatePasswordReset, validateUserEstado, validateUserUpdate } from "../validators/user.validator.js";
import { getDb } from "../db/index.js";
import { createUserRepository } from "../repositories/user.repository.js";

const controller = createUserController(createUserRepository(getDb()));
const authenticate = createAuthenticate(getAuthConfig().secret, createUserRepository(getDb()));

const userRouter = Router();

userRouter.use(authenticate, authorize("COORDINADOR"));

userRouter.post("/", validateUser, controller.create);
userRouter.get("/", controller.list);
userRouter.get("/:id", controller.getById);
userRouter.patch("/:id", validateBody(validateUserUpdate), controller.update);
userRouter.patch("/:id/estado", validateBody(validateUserEstado), controller.setEstado);
userRouter.put("/:id/password", validateBody(validatePasswordReset), controller.resetPassword);

export default userRouter;
