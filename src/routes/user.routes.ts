import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createUserController } from "../controllers/user.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { validateUser } from "../middlewares/validate-user.middleware.js";
import { User } from "../models/user.model.js";

const controller = createUserController(User);
const authenticate = createAuthenticate(getAuthConfig().secret);

const userRouter = Router();

userRouter.use(authenticate, authorize("COORDINADOR"));

userRouter.post("/", validateUser, controller.create);

export default userRouter;
