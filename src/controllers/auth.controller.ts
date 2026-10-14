import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { signToken } from "../auth/token.service.js";
import { type AuthConfig } from "../config/auth.js";
import { type IUser } from "../models/interfaces/IUser.interface.js";

const BCRYPT_ROUNDS = 10;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

export function createAuthController(userModel: Model<IUser>, config: AuthConfig) {
  return {
    async login(req: Request, res: Response): Promise<void> {
      const { email, password } = req.body ?? {};

      if (typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({ message: "email and password are required" });
        return;
      }

      const user = await userModel.findOne({ email: email.trim().toLowerCase() });
      const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

      if (!user || !passwordMatches || user.estado !== "ACTIVO") {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      user.ultimoAcceso = new Date();
      await user.save();

      const token = signToken(
        { userId: String(user._id), role: user.role },
        config.secret,
        config.expiresIn,
      );

      res.json({
        token,
        user: { id: user._id, nombre: user.nombre, apellido: user.apellido, role: user.role },
      });
    },
  };
}
