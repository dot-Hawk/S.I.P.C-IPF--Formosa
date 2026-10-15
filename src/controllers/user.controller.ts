import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type IUser } from "../models/interfaces/IUser.interface.js";
import { isDuplicateKeyError, isMongooseValidationError } from "../utils/mongo-errors.js";

const BCRYPT_ROUNDS = 10;

export function createUserController(userModel: Model<IUser>) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      const { nombre, apellido, dni, legajo, email, password, role } = req.body;

      try {
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await userModel.create({
          nombre,
          apellido,
          dni,
          legajo,
          email,
          passwordHash,
          role,
          estado: "ACTIVO",
        });

        res.status(201).json({
          id: user._id,
          nombre: user.nombre,
          apellido: user.apellido,
          dni: user.dni,
          legajo: user.legajo,
          email: user.email,
          role: user.role,
          estado: user.estado,
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          res.status(409).json({ message: "A user with this dni, legajo or email already exists" });
          return;
        }
        if (isMongooseValidationError(error)) {
          res.status(400).json({ message: error.message });
          return;
        }
        throw error;
      }
    },
  };
}
