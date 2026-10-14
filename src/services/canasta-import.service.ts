import { type CanastaNodoData } from "../domain/canasta.js";
import { type CanastaRepository } from "../repositories/canasta.repository.js";

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

function isUnchanged(existing: object, fields: Fields): boolean {
  const current = existing as Record<string, unknown>;
  return Object.entries(fields).every(([key, value]) => sameValue(current[key], value));
}

// Writes only what is new or changed, so a repeated import is a real no-op (and does not
// touch updatedAt) and its report says what actually moved.
export async function importCanasta(
  canasta: CanastaRepository,
  nodos: CanastaNodoData[],
): Promise<ImportCanastaResult> {
  if (nodos.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  const existing = new Map((await canasta.findAll()).map((node) => [node.codigo, node]));

  const result: ImportCanastaResult = { created: 0, updated: 0, unchanged: 0 };
  const toWrite: CanastaNodoData[] = [];

  for (const nodo of nodos) {
    const current = existing.get(nodo.codigo);

    if (!current) {
      result.created++;
    } else if (isUnchanged(current, fieldsOf(nodo))) {
      result.unchanged++;
      continue;
    } else {
      result.updated++;
    }

    toWrite.push(nodo);
  }

  if (toWrite.length > 0) await canasta.upsertMany(toWrite);

  return result;
}
