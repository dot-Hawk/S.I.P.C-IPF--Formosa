import { type Document, type Types } from "mongoose";

export interface IPrecio extends Document {
  relevamiento: Types.ObjectId;
  producto: Types.ObjectId;
  comercio: Types.ObjectId;
  encuestador: Types.ObjectId;
  valor: number;
  fechaRelevamiento: Date;
  observacion?: string;
  createdAt: Date;
  updatedAt: Date;
}
