import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { createLoginRateLimiters } from "../middlewares/login-rate-limit.middleware.js";
import { getDb } from "../db/index.js";
import { createUserRepository } from "../repositories/user.repository.js";

const controller = createAuthController(createUserRepository(getDb()), getAuthConfig());

const authRouter = Router();

authRouter.post("/login", ...createLoginRateLimiters(), controller.login);

export default authRouter;
