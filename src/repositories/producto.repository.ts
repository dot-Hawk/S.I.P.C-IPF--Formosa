import { and, asc, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { productos, type NewProducto, type Producto } from "../db/schema.js";
import { type EstadoProducto, type UnidadProducto } from "../domain/enums.js";

export interface ProductoFilter {
  categoria?: string;
  unidad?: UnidadProducto;
  estado?: EstadoProducto;
  codigoVariedad?: string;
}

export type ProductoInput = Pick<
  NewProducto,
  "nombre" | "categoria" | "unidad" | "cantidadReferencia" | "marca" | "codigoVariedad" | "estado"
>;

export type ProductoChanges = Partial<ProductoInput>;

export interface ProductoRepository {
  create(data: ProductoInput): Promise<Producto>;
  list(filter: ProductoFilter): Promise<Producto[]>;
  findById(id: string): Promise<Producto | null>;
  update(id: string, changes: ProductoChanges): Promise<Producto | null>;
}

export function createProductoRepository(db: Db): ProductoRepository {
  return {
    async create(data) {
      const [row] = await db.insert(productos).values(data).returning();
      if (!row) throw new Error("Producto insert returned no row");
      return row;
    },

    async list(filter) {
      return db
        .select()
        .from(productos)
        .where(
          and(
            filter.categoria !== undefined ? eq(productos.categoria, filter.categoria) : undefined,
            filter.unidad !== undefined ? eq(productos.unidad, filter.unidad) : undefined,
            filter.estado !== undefined ? eq(productos.estado, filter.estado) : undefined,
            filter.codigoVariedad !== undefined
              ? eq(productos.codigoVariedad, filter.codigoVariedad)
              : undefined,
          ),
        )
        .orderBy(asc(productos.nombre));
    },

    async findById(id) {
      const [row] = await db.select().from(productos).where(eq(productos.id, id)).limit(1);
      return row ?? null;
    },

    async update(id, changes) {
      if (Object.keys(changes).length === 0) return this.findById(id);

      const [row] = await db.update(productos).set(changes).where(eq(productos.id, id)).returning();
      return row ?? null;
    },
  };
}
