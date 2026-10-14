import { type Model } from "mongoose";
import { type CanastaNodoData } from "../domain/canasta.js";
import { type ICanastaNodo } from "../models/interfaces/ICanastaNodo.interface.js";

export interface ImportCanastaResult {
  created: number;
  updated: number;
  unchanged: number;
}

type Fields = Omit<CanastaNodoData, "estado">;

// estado is not part of the imported data: a variedad deactivated through the API must stay
// inactive when the official spreadsheets are imported again.
function fieldsOf(nodo: CanastaNodoData): Fields {
  const { estado: _estado, ...fields } = nodo;
  return fields;
}

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

function isUnchanged(existing: Record<string, unknown>, fields: Fields): boolean {
  return Object.entries(fields).every(([key, value]) => sameValue(existing[key], value));
}

function toOp(nodo: CanastaNodoData) {
  const defined = Object.fromEntries(
    Object.entries(fieldsOf(nodo)).filter(([, value]) => value !== undefined),
  );

  return {
    updateOne: {
      filter: { codigo: nodo.codigo },
      update: { $set: defined, $setOnInsert: { estado: nodo.estado } },
      upsert: true,
    },
  };
}

// Writes only what is new or changed, so a repeated import is a real no-op (and does not
// touch updatedAt) and its report says what actually moved.
export async function importCanasta(
  model: Model<ICanastaNodo>,
  nodos: CanastaNodoData[],
): Promise<ImportCanastaResult> {
  if (nodos.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  const existing = await model.find({}).lean();
  const byCodigo = new Map<string, Record<string, unknown>>(
    existing.map((doc) => [doc.codigo, doc as unknown as Record<string, unknown>]),
  );

  const result: ImportCanastaResult = { created: 0, updated: 0, unchanged: 0 };
  const ops: ReturnType<typeof toOp>[] = [];

  for (const nodo of nodos) {
    const current = byCodigo.get(nodo.codigo);

    if (!current) {
      result.created++;
    } else if (isUnchanged(current, fieldsOf(nodo))) {
      result.unchanged++;
      continue;
    } else {
      result.updated++;
    }

    ops.push(toOp(nodo));
  }

  if (ops.length > 0) await model.bulkWrite(ops);

  return result;
}
