import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthenticate } from "../middlewares/authenticate.middleware.js";
import { validateBody } from "../middlewares/validate-body.middleware.js";
import { validatePasswordChange } from "../validators/user.validator.js";
import { createLoginRateLimiters } from "../middlewares/login-rate-limit.middleware.js";
import { getDb } from "../db/index.js";
import { createUserRepository } from "../repositories/user.repository.js";

const users = createUserRepository(getDb());
const controller = createAuthController(users, getAuthConfig());
const authenticate = createAuthenticate(getAuthConfig().secret, users);

const authRouter = Router();

authRouter.post("/login", ...createLoginRateLimiters(), controller.login);
authRouter.get("/me", authenticate, controller.me);
authRouter.post("/password", authenticate, validateBody(validatePasswordChange), controller.changePassword);

export default authRouter;
