import { type Document, type Types } from "mongoose";

export interface IPrecio extends Document {
  relevamiento: Types.ObjectId;
  producto: Types.ObjectId;
  comercio: Types.ObjectId;
  encuestador: Types.ObjectId;
  valor: number;
  // Price taken from a promotion; kept as registered so results can be split with/without offers.
  oferta: boolean;
  fechaRelevamiento: Date;
  observacion?: string;
  createdAt: Date;
  updatedAt: Date;
}
