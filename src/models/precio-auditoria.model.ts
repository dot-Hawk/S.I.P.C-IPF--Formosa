import { Schema, model } from "mongoose";
import { ACCIONES_AUDITORIA, type IPrecioAuditoria } from "./interfaces/IPrecioAuditoria.interface.js";

const snapshotSchema = new Schema(
  {
    valor: { type: Number, required: true },
    oferta: { type: Boolean, required: true },
    observacion: { type: String, default: null },
    fechaRelevamiento: { type: Date, required: true },
  },
  { _id: false },
);

// The ids are plain references on purpose: the precio may no longer exist.
const precioAuditoriaSchema = new Schema<IPrecioAuditoria>(
  {
    precio: { type: Schema.Types.ObjectId, required: true, index: true },
    relevamiento: { type: Schema.Types.ObjectId, required: true },
    comercio: { type: Schema.Types.ObjectId, required: true },
    producto: { type: Schema.Types.ObjectId, required: true },
    accion: { type: String, enum: ACCIONES_AUDITORIA, required: true },
    usuario: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rol: { type: String, required: true },
    anterior: { type: snapshotSchema, default: null },
    posterior: { type: snapshotSchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const PrecioAuditoria = model<IPrecioAuditoria>("PrecioAuditoria", precioAuditoriaSchema);
