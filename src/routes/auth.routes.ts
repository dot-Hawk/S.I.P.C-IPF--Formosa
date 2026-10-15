import { Router } from "express";
import { getAuthConfig } from "../config/auth.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { User } from "../models/user.model.js";

const controller = createAuthController(User, getAuthConfig());

const authRouter = Router();

authRouter.post("/login", controller.login);

export default authRouter;
