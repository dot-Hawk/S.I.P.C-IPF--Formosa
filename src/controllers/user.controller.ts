import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { type UserRepository } from "../repositories/user.repository.js";
import { isUniqueViolation } from "../utils/db-errors.js";

const BCRYPT_ROUNDS = 10;

export function createUserController(users: UserRepository) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      const { nombre, apellido, dni, legajo, email, password, role } = req.body;

      try {
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await users.create({
          nombre,
          apellido,
          dni,
          legajo,
          email: String(email).trim().toLowerCase(),
          passwordHash,
          role,
          estado: "ACTIVO",
        });

        res.status(201).json({
          id: user.id,
          nombre: user.nombre,
          apellido: user.apellido,
          dni: user.dni,
          legajo: user.legajo,
          email: user.email,
          role: user.role,
          estado: user.estado,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ message: "A user with this dni, legajo or email already exists" });
          return;
        }
        throw error;
      }
    },
  };
}
