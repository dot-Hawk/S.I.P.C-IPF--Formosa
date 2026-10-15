import { type Document, type Types } from "mongoose";

export const ACCIONES_AUDITORIA = ["CREACION", "MODIFICACION", "ELIMINACION"] as const;
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

export interface PrecioSnapshot {
  valor: number;
  oferta: boolean;
  observacion: string | null;
  fechaRelevamiento: Date;
}

// Append-only record of what happened to a precio. It keeps the values, so it stays meaningful
// after the precio itself is deleted.
export interface IPrecioAuditoria extends Document {
  precio: Types.ObjectId;
  relevamiento: Types.ObjectId;
  comercio: Types.ObjectId;
  producto: Types.ObjectId;
  accion: AccionAuditoria;
  usuario: Types.ObjectId;
  rol: string;
  anterior: PrecioSnapshot | null;
  posterior: PrecioSnapshot | null;
  createdAt: Date;
}
