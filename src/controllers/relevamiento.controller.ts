import { type Request, type Response } from "express";
import { isValidObjectId, type Model } from "mongoose";
import { type IRelevamiento } from "../models/interfaces/IRelevamiento.interface.js";
import { isDuplicateKeyError, isMongooseValidationError } from "../utils/mongo-errors.js";

export function createRelevamientoController(model: Model<IRelevamiento>) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      const { periodo, frecuencia, fechaInicio, fechaLimite } = req.body;

      try {
        const relevamiento = await model.create({
          periodo,
          frecuencia,
          fechaInicio,
          fechaLimite,
          estado: "ABIERTO",
        });
        res.status(201).json(relevamiento);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          res.status(409).json({ message: "A relevamiento already exists for this periodo and frecuencia" });
          return;
        }
        if (isMongooseValidationError(error)) {
          res.status(400).json({ message: error.message });
          return;
        }
        throw error;
      }
    },

    async list(_req: Request, res: Response): Promise<void> {
      const relevamientos = await model.find().sort({ fechaInicio: -1 });
      res.json(relevamientos);
    },

    async getById(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!id || !isValidObjectId(id)) {
        res.status(400).json({ message: "Invalid relevamiento id" });
        return;
      }

      const relevamiento = await model.findById(id);
      if (!relevamiento) {
        res.status(404).json({ message: "Relevamiento not found" });
        return;
      }

      res.json(relevamiento);
    },

    async close(req: Request, res: Response): Promise<void> {
      const id = req.params["id"];

      if (!id || !isValidObjectId(id)) {
        res.status(400).json({ message: "Invalid relevamiento id" });
        return;
      }

      // Single atomic update: only an ABIERTO relevamiento can transition, even under concurrent requests.
      const closed = await model.findOneAndUpdate(
        { _id: id, estado: "ABIERTO" },
        { estado: "CERRADO" },
        { new: true },
      );

      if (closed) {
        res.json(closed);
        return;
      }

      if (await model.exists({ _id: id })) {
        res.status(409).json({ message: "Relevamiento is already closed" });
        return;
      }

      res.status(404).json({ message: "Relevamiento not found" });
    },
  };
}
