import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { signToken } from "../auth/token.service.js";
import { type AuthConfig } from "../config/auth.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type UserRepository } from "../repositories/user.repository.js";
import { toUserView } from "./user.controller.js";

const BCRYPT_ROUNDS = 10;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

export function createAuthController(users: UserRepository, config: AuthConfig) {
  return {
    async login(req: Request, res: Response): Promise<void> {
      const { email, password } = req.body ?? {};

      if (typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({ message: "email and password are required" });
        return;
      }

      const user = await users.findByEmail(email.trim().toLowerCase());
      const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

      if (!user || !passwordMatches || user.estado !== "ACTIVO") {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      await users.touchLastAccess(user.id, new Date());

      const token = signToken({ userId: user.id, role: user.role }, config.secret, config.expiresIn);

      res.json({
        token,
        user: { id: user.id, nombre: user.nombre, apellido: user.apellido, role: user.role },
      });
    },

    async me(_req: Request, res: Response): Promise<void> {
      const auth = res.locals[AUTH_LOCALS_KEY] as { userId: string } | undefined;
      const user = auth ? await users.findById(auth.userId) : null;
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.json(toUserView(user));
    },

    async changePassword(req: Request, res: Response): Promise<void> {
      const auth = res.locals[AUTH_LOCALS_KEY] as { userId: string } | undefined;
      const user = auth ? await users.findById(auth.userId) : null;
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
        res.status(400).json({ message: "The current password is not correct" });
        return;
      }

      await users.update(user.id, { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
      res.status(204).end();
    },
  };
}
