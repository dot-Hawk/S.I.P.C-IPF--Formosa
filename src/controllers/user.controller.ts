import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { type User } from "../db/schema.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type UserChanges, type UserFilter, type UserRepository } from "../repositories/user.repository.js";
import { isUniqueViolation } from "../utils/db-errors.js";
import { isUuid } from "../utils/uuid.js";
import { parsePage, validatePagination } from "../validators/pagination.js";
import { validateUserFilters } from "../validators/user.validator.js";

const BCRYPT_ROUNDS = 10;
const EDITABLE_FIELDS = ["nombre", "apellido", "dni", "legajo", "role"] as const;

// Never exposes the password hash.
export function toUserView(user: User) {
  return {
    id: user.id,
    nombre: user.nombre,
    apellido: user.apellido,
    dni: user.dni,
    legajo: user.legajo,
    email: user.email,
    role: user.role,
    estado: user.estado,
    ultimoAcceso: user.ultimoAcceso,
  };
}

function callerId(res: Response): string | undefined {
  return (res.locals[AUTH_LOCALS_KEY] as { userId?: string } | undefined)?.userId;
}

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

    async list(req: Request, res: Response): Promise<void> {
      const filters = validateUserFilters(req.query);
      const pagination = validatePagination(req.query);
      if (!filters.valid || pagination.length > 0) {
        res.status(400).json({ errors: [...filters.errors, ...pagination] });
        return;
      }

      // Validated above, so the strings are members of the closed sets.
      const { role, estado } = req.query;
      const filter: UserFilter = {
        ...(typeof role === "string" ? { role: role as NonNullable<UserFilter["role"]> } : {}),
        ...(typeof estado === "string" ? { estado: estado as NonNullable<UserFilter["estado"]> } : {}),
      };

      const found = await users.list(filter, parsePage(req.query));
      res.json(found.map(toUserView));
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid user id" });
        return;
      }

      const user = await users.findById(id);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.json(toUserView(user));
    },

    async update(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid user id" });
        return;
      }

      // Otherwise the only coordinator could lock themselves out of the system.
      if (req.body.role !== undefined && id === callerId(res)) {
        res.status(403).json({ message: "You cannot change your own role" });
        return;
      }

      const changes: UserChanges = {};
      for (const field of EDITABLE_FIELDS) {
        const value = req.body[field];
        if (value !== undefined) (changes as Record<string, unknown>)[field] = typeof value === "string" ? value.trim() : value;
      }
      if (req.body.email !== undefined) changes.email = String(req.body.email).trim().toLowerCase();

      try {
        const user = await users.update(id, changes);
        if (!user) {
          res.status(404).json({ message: "User not found" });
          return;
        }
        res.json(toUserView(user));
      } catch (error) {
        if (isUniqueViolation(error)) {
          res.status(409).json({ message: "A user with this dni, legajo or email already exists" });
          return;
        }
        throw error;
      }
    },

    // Takes effect on the user's next request: the middleware reads the estado from the database.
    async setEstado(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid user id" });
        return;
      }

      if (id === callerId(res)) {
        res.status(403).json({ message: "You cannot change your own estado" });
        return;
      }

      const user = await users.update(id, { estado: req.body.estado });
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.json(toUserView(user));
    },

    async resetPassword(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];
      if (!isUuid(id)) {
        res.status(400).json({ message: "Invalid user id" });
        return;
      }

      const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
      const user = await users.update(id, { passwordHash });
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.status(204).end();
    },
  };
}
